// Online payments by PI-SPI through Paygate (PRO-189) and the public payment page (PRO-187).
//
//   GET  /api/pay/:token          what the payment page shows: seller, invoice number, what is left to pay now
//   POST /api/pay/:token/collect  the PI-SPI QR code to pay it through Paygate (a Paygate collection, `pispi_qr`)
//   POST /api/paygate/webhook     Paygate's events, signature checked, applied once (apply_paygate_event)
//
// The Paygate key and the Supabase service role key are Worker secrets: neither reaches the browser or a PDF.
// The database does the bookkeeping (supabase/migrations/20261124_pispi_online_payments.sql); this file only
// carries requests between the page, Paygate and Supabase.

export interface PaygateEnv {
  /** Public Supabase project URL (wrangler.toml [vars]) */
  SUPABASE_URL: string;
  /** Secret: Supabase service role key, for the server-side functions only */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Paygate's base URL, e.g. https://paygate.example (wrangler.toml [vars]) */
  PAYGATE_URL?: string;
  /** Secret: Billio's Paygate API key (pgk_…) */
  PAYGATE_API_KEY?: string;
  /** Secret: the signing secret of Paygate's webhooks to Billio (whsec_…) */
  PAYGATE_WEBHOOK_SECRET?: string;
}

const enc = new TextEncoder();
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

// ---- Paygate's webhook signature ---------------------------------------------------------------------------------

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison. */
function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/**
 * `Paygate-Signature: t=<unix seconds>,v1=<hex>`: the HMAC-SHA256 of `<t>.<raw body>` under the webhook secret.
 * Checked on the raw body, refused when older (or newer) than 5 minutes, compared in constant time.
 */
export async function verifyPaygateSignature(secret: string, rawBody: string, header: string | null, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const m = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/.exec((header ?? '').trim());
  if (!m || !secret) return false;
  if (Math.abs(nowSeconds - Number(m[1])) > 300) return false;
  return safeEqual(m[2]!, await hmacHex(secret, `${m[1]}.${rawBody}`));
}

/** For tests and local tools: the header Paygate would send. */
export async function signPaygateBody(secret: string, rawBody: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`;
}

// ---- Supabase (service role) -------------------------------------------------------------------------------------

async function rpc<T>(env: PaygateEnv, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`supabase ${fn}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// ---- the payment page --------------------------------------------------------------------------------------------

/** The QR fields Paygate returns; @pi-spi/qrcode turns them into the BCEAO payload. */
export interface PispiQrFields { alias: string; countryCode: string; qrType: 'DYNAMIC' | 'STATIC'; referenceLabel: string; amount: number }

interface Opened { error?: string; reference?: string; amount?: number; paygateId?: string | null; qr?: PispiQrFields | null; expiresAt?: string | null; invoice?: string; org?: string }

const TOKEN = /^[0-9a-f]{32,64}$/;
const COLLECT_ERRORS: Record<string, [number, string]> = {
  not_found:   [404, 'Ce lien de paiement n’existe pas ou a été désactivé.'],
  not_online:  [409, 'Cette entreprise n’accepte pas encore le paiement en ligne.'],
  not_open:    [409, 'Cette facture n’attend plus de paiement.'],
  nothing_due: [409, 'Il ne reste rien à payer sur cette facture.'],
  not_whole:   [409, 'Le montant restant n’est pas un nombre entier de F CFA : contactez l’entreprise.'],
  too_small:   [409, 'Le montant restant est inférieur au minimum de 100 F CFA.'],
};

/**
 * Asks Paygate for the collection the database opened (or reuses the one already started): Paygate answers a
 * repeat of the same reference with the same payment, so a retry never creates a second one.
 */
async function collect(env: PaygateEnv, token: string): Promise<Response> {
  if (!env.PAYGATE_URL || !env.PAYGATE_API_KEY) return json(503, { error: 'not_configured', message: 'Le paiement en ligne n’est pas encore disponible.' });
  const o = await rpc<Opened>(env, 'open_paygate_collection', { p_token: token });
  if (o.error) { const [status, message] = COLLECT_ERRORS[o.error] ?? [409, 'Paiement impossible pour le moment.']; return json(status, { error: o.error, message }); }
  if (o.paygateId && o.qr) return json(200, { amount: o.amount, qr: o.qr, expiresAt: o.expiresAt, paymentId: o.paygateId });

  const res = await fetch(new URL('/v1/collections', env.PAYGATE_URL).href, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.PAYGATE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: o.reference, amount: o.amount, rail: 'pispi_qr', metadata: { org: o.org, invoice: o.invoice, source: 'billio' } }),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; status?: string; qr?: PispiQrFields | null; expiresAt?: number | null; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !body?.id || !body.qr) {
    console.error('[paygate] collection refused', res.status, body?.error?.code, body?.error?.message);
    return json(502, { error: 'unavailable', message: 'Paiement en ligne indisponible. Réessayez dans quelques minutes.' });
  }
  const expiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
  await rpc(env, 'start_paygate_collection', { p_reference: o.reference, p_paygate_id: body.id, p_qr: body.qr, p_expires_at: expiresAt, p_status: body.status ?? 'processing' });
  return json(200, { amount: o.amount, qr: body.qr, expiresAt, paymentId: body.id });
}

/** Paygate's events: refused unless signed with Billio's secret, then applied once by the database. */
async function webhook(request: Request, env: PaygateEnv): Promise<Response> {
  if (!env.PAYGATE_WEBHOOK_SECRET) return json(503, { error: 'not_configured' });
  const raw = await request.text();
  if (!(await verifyPaygateSignature(env.PAYGATE_WEBHOOK_SECRET, raw, request.headers.get('Paygate-Signature')))) return json(401, { error: 'bad_signature' });
  let event: unknown;
  try { event = JSON.parse(raw); } catch { return json(400, { error: 'invalid_json' }); }
  if (!event || typeof event !== 'object' || typeof (event as { id?: unknown }).id !== 'string') return json(400, { error: 'invalid_event' });
  // an error here is answered 500, so Paygate delivers the event again later; a repeat is applied only once
  try {
    return json(200, { received: true, result: await rpc<unknown>(env, 'apply_paygate_event', { p_event: event }) });
  } catch (err) {
    console.error('[paygate] event not applied', (event as { id: string }).id, err);
    return json(500, { error: 'not_applied' });
  }
}

/** The /api/pay and /api/paygate routes, or null for any other path. */
export async function handlePaygate(request: Request, env: PaygateEnv, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/paygate/webhook') {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'not_configured' });
    return webhook(request, env);
  }
  const m = /^\/api\/pay\/([^/]+)(\/collect)?$/.exec(url.pathname);
  if (!m) return null;
  const token = m[1]!;
  if (!TOKEN.test(token)) return json(404, { error: 'not_found', message: COLLECT_ERRORS.not_found![1] });
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'not_configured', message: 'Le paiement en ligne n’est pas encore disponible.' });
  try {
    if (m[2]) {
      if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      return await collect(env, token);
    }
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const page = await rpc<Record<string, unknown> | null>(env, 'payment_page', { p_token: token });
    return page ? json(200, page) : json(404, { error: 'not_found', message: COLLECT_ERRORS.not_found![1] });
  } catch (err) {
    console.error('[pay] failed', err);
    return json(502, { error: 'unavailable', message: 'Service momentanément indisponible. Réessayez dans quelques minutes.' });
  }
}
