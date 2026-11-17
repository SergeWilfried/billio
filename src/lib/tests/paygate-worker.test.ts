import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePaygate, signPaygateBody, verifyPaygateSignature, type PaygateEnv } from '../../../worker/paygate';

const SECRET = 'whsec_test_secret_0123456789';
const TOKEN = 'a'.repeat(64);
const env: PaygateEnv = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service', PAYGATE_URL: 'https://paygate.test', PAYGATE_API_KEY: 'pgk_key', PAYGATE_WEBHOOK_SECRET: SECRET };
const QR = { alias: '3497a720-ab11-4973-9619-534e04f263a1', countryCode: 'BF', qrType: 'DYNAMIC', referenceLabel: 'PG0123456789ABCDEF01', amount: 4000 };

/** a Supabase and a Paygate that record what they are asked */
let calls: { url: string; body: unknown; headers: Record<string, string> }[];
let rpcAnswer: Record<string, unknown>;
let paygateAnswer: () => Response;
beforeEach(() => {
  calls = []; rpcAnswer = {};
  paygateAnswer = () => new Response(JSON.stringify({ id: 'pg0123456789abcdef01', status: 'processing', qr: QR, expiresAt: 1793491200000 }), { status: 201 });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null, headers });
    const u = new URL(String(input));
    if (u.host === 'db.test') return new Response(JSON.stringify(rpcAnswer[u.pathname.split('/').pop()!] ?? null));
    if (u.host === 'paygate.test') return paygateAnswer();
    throw new Error(`unexpected ${input}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const call = (method: string, path: string, init: RequestInit = {}) => {
  const req = new Request(`https://billio.test${path}`, { method, ...init });
  return handlePaygate(req, env, new URL(req.url));
};

describe('Paygate webhook signature', () => {
  it('accepts Paygate\'s own signature, and nothing tampered, replayed or unsigned', async () => {
    const body = '{"id":"evt_1","type":"payment.completed"}';
    const now = 1_790_000_000;
    const header = await signPaygateBody(SECRET, body, now);
    expect(await verifyPaygateSignature(SECRET, body, header, now)).toBe(true);
    expect(await verifyPaygateSignature(SECRET, body.replace('completed', 'failed'), header, now)).toBe(false);
    expect(await verifyPaygateSignature('whsec_other', body, header, now)).toBe(false);
    expect(await verifyPaygateSignature(SECRET, body, header, now + 301)).toBe(false);
    expect(await verifyPaygateSignature(SECRET, body, null, now)).toBe(false);
    expect(await verifyPaygateSignature(SECRET, body, 't=1790000000,v1=zz', now)).toBe(false);
  });
});

describe('/api/paygate/webhook', () => {
  it('refuses an unsigned event and never reaches the database', async () => {
    const r = await call('POST', '/api/paygate/webhook', { body: '{"id":"evt_1","type":"payment.completed","data":{}}', headers: { 'Paygate-Signature': 't=1,v1=' + '0'.repeat(64) } });
    expect(r!.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('passes a signed event to apply_paygate_event as it was sent, and acknowledges with 200', async () => {
    rpcAnswer.apply_paygate_event = { recorded: 'PAI-0008' };
    const event = { id: 'evt_pg_1', type: 'payment.completed', data: { id: 'pg01', reference: 'bl_x', amount: 4000 } };
    const raw = JSON.stringify(event);
    const r = await call('POST', '/api/paygate/webhook', { body: raw, headers: { 'Paygate-Signature': await signPaygateBody(SECRET, raw, Math.floor(Date.now() / 1000)) } });
    expect(r!.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://db.test/rest/v1/rpc/apply_paygate_event');
    expect(calls[0]!.body).toEqual({ p_event: event });
    expect(calls[0]!.headers.authorization).toBe('Bearer service');
  });

  it('answers 500 when the database fails, so Paygate delivers the event again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const raw = '{"id":"evt_2","type":"payment.completed"}';
    const r = await call('POST', '/api/paygate/webhook', { body: raw, headers: { 'Paygate-Signature': await signPaygateBody(SECRET, raw, Math.floor(Date.now() / 1000)) } });
    expect(r!.status).toBe(500);
  });
});

describe('/api/pay/:token', () => {
  it('a token that is not ours never reaches the database', async () => {
    expect((await call('GET', '/api/pay/INV-1'))!.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('shows what the database says the page may show', async () => {
    rpcAnswer.payment_page = { seller: 'Boutique Faso', invoice: 'FA-2026-001', balance: 4000, state: 'open', mode: 'paygate' };
    const r = await call('GET', `/api/pay/${TOKEN}`);
    expect(r!.status).toBe(200);
    expect(await r!.json()).toMatchObject({ seller: 'Boutique Faso', balance: 4000 });
    expect(r!.headers.get('Cache-Control')).toBe('no-store');
  });

  it('creates the Paygate collection server-side, with the key, the database\'s reference and exactly what is due', async () => {
    rpcAnswer.open_paygate_collection = { reference: 'bl_abc', amount: 4000, paygateId: null, qr: null, invoice: 'INV-1', org: 'org-1' };
    const r = await call('POST', `/api/pay/${TOKEN}/collect`);
    expect(r!.status).toBe(200);
    const body = await r!.json() as { qr: unknown; amount: number };
    expect(body).toMatchObject({ amount: 4000, qr: QR });
    const pg = calls.find((c) => c.url === 'https://paygate.test/v1/collections')!;
    expect(pg.headers.authorization).toBe('Bearer pgk_key');
    expect(pg.body).toMatchObject({ reference: 'bl_abc', amount: 4000, rail: 'pispi_qr' });
    const started = calls.find((c) => c.url.endsWith('/rpc/start_paygate_collection'))!;
    expect(started.body).toMatchObject({ p_reference: 'bl_abc', p_paygate_id: 'pg0123456789abcdef01', p_qr: QR });
    expect(JSON.stringify(body)).not.toContain('pgk_key');
  });

  it('reuses a collection already started: Paygate is not asked again', async () => {
    rpcAnswer.open_paygate_collection = { reference: 'bl_abc', amount: 4000, paygateId: 'pg01', qr: QR, expiresAt: '2026-11-18T12:00:00Z' };
    const r = await call('POST', `/api/pay/${TOKEN}/collect`);
    expect(r!.status).toBe(200);
    expect(calls.some((c) => c.url.startsWith('https://paygate.test'))).toBe(false);
  });

  it('says why when nothing can be paid, and when Paygate refuses', async () => {
    rpcAnswer.open_paygate_collection = { error: 'not_online' };
    let r = await call('POST', `/api/pay/${TOKEN}/collect`);
    expect(r!.status).toBe(409);
    expect((await r!.json() as { message: string }).message).toMatch(/pas encore/);
    rpcAnswer.open_paygate_collection = { reference: 'bl_abc', amount: 4000, paygateId: null, qr: null };
    paygateAnswer = () => new Response(JSON.stringify({ error: { code: 'wallet_not_enabled' } }), { status: 422 });
    r = await call('POST', `/api/pay/${TOKEN}/collect`);
    expect(r!.status).toBe(502);
    expect(calls.some((c) => c.url.endsWith('/start_paygate_collection'))).toBe(false);
  });
});
