-- Online payments by PI-SPI (PRO-189, PRO-187)
--
-- A business turns online payment on (online_mode <> 'off') and gives its PI-SPI alias. It is then paid:
--   alias   : on its own PI-SPI alias, no commission. The payment page shows a PI-SPI QR code for that alias with
--             the invoice number as the reference; the payment is matched from the statement (PRO-175).
--   paygate : once Billio approves it (paygate_status), through Paygate, which confirms the payment itself, for a
--             commission. Paygate is internal: users never see its name. Billio is one product of Paygate and holds
--             its key server-side (the Worker).
-- Paystack / pawaPay sub-accounts and the card / Wave / Mobile Money checkout are gone from the app; their
-- columns stay (unused) so that older rows keep loading.
--
-- Money flow through Paygate:
--   payment page (/payer/<token>) -> Worker -> open_paygate_collection() -> Paygate POST /v1/collections
--   Paygate webhook -> Worker (signature checked) -> apply_paygate_event() -> incoming_payments (+ payments)
-- Every step is idempotent: a reference is reused while its collection is open, an event id is applied once,
-- a Paygate payment id is recorded once per business.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Settings: which way, the business's own alias, and Paygate's terms (set by Progiciel only)
-- ---------------------------------------------------------------------------------------------------------------
alter table public.org_payment_settings
  add column if not exists online_mode            text          not null default 'off',
  add column if not exists pispi_alias            text          not null default '',
  add column if not exists pispi_country          text          not null default 'BF',
  -- none: not asked | pending: asked, waiting for Progiciel's KYB check | approved | suspended
  add column if not exists paygate_status         text          not null default 'none',
  -- Paygate's commission, % of each payment received. Provisional until it is decided (PRO-189).
  -- Payouts go to the business's own alias (pispi_alias), by hand until Paygate pays out.
  add column if not exists paygate_commission_pct numeric(5,2)  not null default 1.00;

alter table public.org_payment_settings drop constraint if exists org_payment_settings_online_mode_check;
alter table public.org_payment_settings add constraint org_payment_settings_online_mode_check check (online_mode in ('off', 'alias', 'paygate'));
alter table public.org_payment_settings drop constraint if exists org_payment_settings_paygate_status_check;
alter table public.org_payment_settings add constraint org_payment_settings_paygate_status_check check (paygate_status in ('none', 'pending', 'approved', 'suspended'));
alter table public.org_payment_settings drop constraint if exists org_payment_settings_pispi_country_check;
alter table public.org_payment_settings add constraint org_payment_settings_pispi_country_check check (pispi_country in ('BF', 'CI', 'SN', 'ML', 'NE', 'TG', 'BJ', 'GW'));
alter table public.org_payment_settings drop constraint if exists org_payment_settings_commission_check;
alter table public.org_payment_settings add constraint org_payment_settings_commission_check check (paygate_commission_pct >= 0 and paygate_commission_pct < 100);

-- A business may ask for Paygate (none -> pending) or withdraw its request (pending -> none). Approving,
-- suspending and the commission are Progiciel's: the Supabase dashboard / SQL editor or the service role.
create or replace function public.protect_paygate_terms()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.paygate_status not in ('none', 'pending') then new.paygate_status := 'none'; end if;
    new.paygate_commission_pct := 1.00;
    return new;
  end if;
  if new.paygate_commission_pct is distinct from old.paygate_commission_pct then
    raise exception 'the Paygate commission can only be changed by Billio' using errcode = '42501';
  end if;
  if new.paygate_status is distinct from old.paygate_status
     and not (old.paygate_status = 'none' and new.paygate_status = 'pending')
     and not (old.paygate_status = 'pending' and new.paygate_status = 'none') then
    raise exception 'Paygate activation is decided by Billio' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_paygate_terms on public.org_payment_settings;
create trigger protect_paygate_terms
  before insert or update on public.org_payment_settings
  for each row execute function public.protect_paygate_terms();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Payments: a PI-SPI method
-- ---------------------------------------------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('cash', 'wire', 'momo', 'cheque', 'wave', 'card', 'pispi'));

-- ---------------------------------------------------------------------------------------------------------------
-- 3. The public payment link of an invoice (PRO-187): a token that cannot be guessed, one per invoice
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.invoice_payment_links (
  token      text        primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  org_id     uuid        not null references public.organizations on delete cascade,
  invoice_id text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, invoice_id),
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete cascade
);
alter table public.invoice_payment_links enable row level security;
drop policy if exists "payment_links: members read/write" on public.invoice_payment_links;
create policy "payment_links: members read/write" on public.invoice_payment_links
  for all using (org_id in (select public.my_org_ids())) with check (org_id in (select public.my_org_ids()));

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Paygate: collections asked for, events received, and every payment received online
-- ---------------------------------------------------------------------------------------------------------------
-- One row per Paygate collection; the reference is Billio's (sent to Paygate, which answers a repeat with the
-- same payment). Server-side only: no policy, so no app user reads or writes it.
create table if not exists public.paygate_collections (
  reference  text        primary key,
  org_id     uuid        not null references public.organizations on delete cascade,
  invoice_id text        not null,
  amount     numeric     not null,
  paygate_id text        unique,
  status     text        not null default 'processing',
  qr         jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists paygate_collections_invoice on public.paygate_collections (org_id, invoice_id, created_at desc);
alter table public.paygate_collections enable row level security;

-- Paygate delivers each event at least once: an event id is applied once.
create table if not exists public.paygate_events (
  id          text        primary key,
  type        text        not null,
  received_at timestamptz not null default now()
);
alter table public.paygate_events enable row level security;

-- Every payment received online, matched to its invoice or waiting for a person (« À vérifier »).
-- external_ref is unique per business and source: a payment is never counted twice.
create table if not exists public.incoming_payments (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations on delete cascade,
  source        text        not null check (source in ('paygate', 'statement')),
  external_ref  text        not null,
  invoice_id    text,
  amount        numeric     not null,
  commission    numeric     not null default 0,
  net           numeric     not null,
  status        text        not null check (status in ('matched', 'to_check')),
  detail        text,
  payment_id    text,
  -- Paygate pays the business out by hand for now: « Reversement en attente » until it is done
  payout_status text        not null default 'pending' check (payout_status in ('pending', 'paid', 'none')),
  received_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (org_id, source, external_ref)
);
create index if not exists incoming_payments_org on public.incoming_payments (org_id, received_at desc);
alter table public.incoming_payments enable row level security;
drop policy if exists "incoming_payments: members read" on public.incoming_payments;
create policy "incoming_payments: members read" on public.incoming_payments
  for select using (org_id in (select public.my_org_ids()));

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Server-side functions (called by the Worker with the service role only)
-- ---------------------------------------------------------------------------------------------------------------

-- How a business is paid online: 'off' unless it turned it on; then through Paygate once Billio approved it; else
-- on its own alias when it has one.
create or replace function public.online_payment_mode(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
             when s.online_mode = 'off' then 'off'
             when s.paygate_status = 'approved' then 'paygate'
             when s.pispi_alias <> '' then 'alias'
             else 'off'
           end
      from org_payment_settings s where s.org_id = p_org_id), 'off');
$$;

-- What the public payment page shows, read when it is opened: never more than the seller, the invoice
-- number and what is left to pay. Null when the link does not exist or was turned off.
create or replace function public.payment_page(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l invoice_payment_links%rowtype;
  i record;
  v_mode text; v_balance numeric; v_state text;
  v_alias text; v_country text;
begin
  select * into l from invoice_payment_links where token = p_token and active;
  if not found then return null; end if;
  select inv.id, inv.number, inv.status, inv.amount, inv.issued_at, o.name as seller
    into i from invoices inv join organizations o on o.id = inv.org_id
   where inv.org_id = l.org_id and inv.id = l.invoice_id;
  if not found then return null; end if;

  v_balance := greatest(coalesce(invoice_balance(l.org_id, l.invoice_id), 0), 0);
  v_state := case when i.status = 'draft' then 'closed'
                  when i.status = 'paid' or v_balance <= 0 then 'paid'
                  else 'open' end;
  v_mode := online_payment_mode(l.org_id);
  select pispi_alias, pispi_country into v_alias, v_country from org_payment_settings where org_id = l.org_id;

  return jsonb_build_object(
    'seller',   i.seller,
    'invoice',  coalesce(i.number, i.id),
    'issuedAt', i.issued_at,
    'total',    i.amount,
    'balance',  v_balance,
    'currency', 'XOF',
    'state',    v_state,
    'mode',     v_mode,
    -- the business's own alias, only when that is how it is paid (the QR code is built from it)
    'alias',    case when v_mode = 'alias' then v_alias end,
    'country',  case when v_mode = 'alias' then v_country end
  );
end;
$$;

-- The Paygate collection to show for this link: the one still open for exactly what is left to pay, or a new
-- reference (the Worker then asks Paygate for it). The invoice is locked, so two clicks never make two.
create or replace function public.open_paygate_collection(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l invoice_payment_links%rowtype;
  v_status text; v_balance numeric;
  c paygate_collections%rowtype;
begin
  select * into l from invoice_payment_links where token = p_token and active;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select status into v_status from invoices where org_id = l.org_id and id = l.invoice_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if online_payment_mode(l.org_id) <> 'paygate' then return jsonb_build_object('error', 'not_online'); end if;
  if v_status not in ('pending', 'overdue') then return jsonb_build_object('error', 'not_open'); end if;

  v_balance := coalesce(invoice_balance(l.org_id, l.invoice_id), 0);
  if v_balance <= 0 then return jsonb_build_object('error', 'nothing_due'); end if;
  if v_balance <> trunc(v_balance) then return jsonb_build_object('error', 'not_whole'); end if;
  if v_balance < 100 then return jsonb_build_object('error', 'too_small'); end if;

  -- reuse: same amount, still processing, and either started (QR valid at least 5 more minutes) or just asked
  select * into c from paygate_collections
   where org_id = l.org_id and invoice_id = l.invoice_id and amount = v_balance and status = 'processing'
     and ((paygate_id is not null and expires_at > now() + interval '5 minutes')
       or (paygate_id is null and created_at > now() - interval '2 minutes'))
   order by created_at desc limit 1;
  if not found then
    insert into paygate_collections (reference, org_id, invoice_id, amount)
    values ('bl_' || replace(gen_random_uuid()::text, '-', ''), l.org_id, l.invoice_id, v_balance)
    returning * into c;
  end if;

  return jsonb_build_object('reference', c.reference, 'amount', c.amount, 'paygateId', c.paygate_id, 'qr', c.qr,
    'expiresAt', c.expires_at, 'invoice', l.invoice_id, 'org', l.org_id);
end;
$$;

-- What Paygate answered for a collection: its payment id, the QR fields and when the QR expires.
create or replace function public.start_paygate_collection(p_reference text, p_paygate_id text, p_qr jsonb, p_expires_at timestamptz, p_status text)
returns void
language sql
security definer
set search_path = public
as $$
  update paygate_collections
     set paygate_id = coalesce(paygate_id, p_paygate_id), qr = coalesce(p_qr, qr), expires_at = coalesce(p_expires_at, expires_at),
         status = coalesce(p_status, status)
   where reference = p_reference;
$$;

-- A Paygate event, already authenticated by the Worker (its signature). Applied once per event id; a completed
-- payment is recorded once per Paygate payment id and settles its invoice when it still can; anything else
-- (a wrong amount, an invoice already settled) waits for a person as « À vérifier ».
create or replace function public.apply_paygate_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb := p_event -> 'data';
  v_type text := p_event ->> 'type';
  c paygate_collections%rowtype;
  v_amount numeric; v_pct numeric; v_comm numeric; v_at timestamptz;
  v_in uuid; v_found boolean; v_inv_status text; v_client text; v_pid text; v_n integer;
begin
  if p_event ->> 'id' is null or v_type is null then
    return jsonb_build_object('ignored', 'malformed');
  end if;
  insert into paygate_events (id, type) values (p_event ->> 'id', v_type) on conflict (id) do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;

  if d is null or d ->> 'reference' is null then return jsonb_build_object('ignored', 'no_payment'); end if;
  select * into c from paygate_collections where reference = d ->> 'reference' for update;
  if not found then return jsonb_build_object('ignored', 'unknown_reference'); end if;

  update paygate_collections
     set status = coalesce(d ->> 'status', status), paygate_id = coalesce(paygate_id, d ->> 'id')
   where reference = c.reference;

  if v_type = 'payment.completed' then
    v_amount := (d ->> 'amount')::numeric;
    select paygate_commission_pct into v_pct from org_payment_settings where org_id = c.org_id;
    v_comm := round(v_amount * coalesce(v_pct, 1.00) / 100);
    v_at := coalesce(to_timestamp((d ->> 'settledAt')::double precision / 1000), now());

    insert into incoming_payments (org_id, source, external_ref, invoice_id, amount, commission, net, status, payout_status, received_at)
    values (c.org_id, 'paygate', d ->> 'id', c.invoice_id, v_amount, v_comm, v_amount - v_comm, 'to_check', 'pending', v_at)
    on conflict (org_id, source, external_ref) do nothing
    returning id into v_in;
    if v_in is null then return jsonb_build_object('duplicate_payment', true); end if;

    select status, client_code into v_inv_status, v_client from invoices where org_id = c.org_id and id = c.invoice_id for update;
    v_found := found;
    if v_found and v_inv_status in ('pending', 'overdue') and v_amount <= invoice_balance(c.org_id, c.invoice_id) then
      -- the next PAI-<n> of the business (as next_payment_number, without a signed-in member)
      insert into payment_sequences (org_id, last_number)
      values (c.org_id, coalesce((select max(substring(id from '^PAI-(\d+)$')::integer) from payments where org_id = c.org_id), 0) + 1)
      on conflict (org_id) do update set last_number = payment_sequences.last_number + 1
      returning last_number into v_n;
      v_pid := 'PAI-' || lpad(v_n::text, 4, '0');
      insert into payments (id, org_id, created_by, date, client_code, inv_id, method, ref, amount, status, source)
      values (v_pid, c.org_id, null, v_at::date, v_client, c.invoice_id, 'pispi', 'Paygate ' || (d ->> 'id'), v_amount, 'completed', 'online');
      perform refresh_invoice_status(c.org_id, c.invoice_id);
      update incoming_payments set status = 'matched', payment_id = v_pid where id = v_in;
      return jsonb_build_object('recorded', v_pid);
    end if;
    update incoming_payments
       set detail = case when not v_found then 'Facture introuvable'
                         when v_inv_status not in ('pending', 'overdue') then 'Facture déjà réglée ou fermée'
                         else 'Montant supérieur au solde de la facture' end
     where id = v_in;
    return jsonb_build_object('to_check', true);
  end if;

  if v_type = 'payment.mismatch' then
    -- money arrived for another amount or by another route: Paygate settled nothing, a person looks
    insert into incoming_payments (org_id, source, external_ref, invoice_id, amount, commission, net, status, payout_status, received_at, detail)
    values (c.org_id, 'paygate', (d ->> 'id') || ':mismatch', c.invoice_id, coalesce((d ->> 'amount')::numeric, 0), 0, 0, 'to_check', 'none', now(),
            'Paiement reçu pour un autre montant ou par un autre canal : à vérifier')
    on conflict (org_id, source, external_ref) do nothing;
    return jsonb_build_object('to_check', true);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.online_payment_mode(uuid) from public;
revoke all on function public.payment_page(text) from public;
revoke all on function public.open_paygate_collection(text) from public;
revoke all on function public.start_paygate_collection(text, text, jsonb, timestamptz, text) from public;
revoke all on function public.apply_paygate_event(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.online_payment_mode(uuid) from anon, authenticated;
    revoke all on function public.payment_page(text) from anon, authenticated;
    revoke all on function public.open_paygate_collection(text) from anon, authenticated;
    revoke all on function public.start_paygate_collection(text, text, jsonb, timestamptz, text) from anon, authenticated;
    revoke all on function public.apply_paygate_event(jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.payment_page(text) to service_role;
    grant execute on function public.open_paygate_collection(text) to service_role;
    grant execute on function public.start_paygate_collection(text, text, jsonb, timestamptz, text) to service_role;
    grant execute on function public.apply_paygate_event(jsonb) to service_role;
  end if;
end;
$$;
