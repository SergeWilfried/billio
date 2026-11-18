-- Checks 20261124_pispi_online_payments.sql on a minimal schema: Paygate's terms are Progiciel's, the payment
-- page and collections follow the business's mode, and Paygate events are applied exactly once.
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.organizations (id uuid primary key, name text not null);
create table public.org_members (org_id uuid, user_id uuid, role text);
create or replace function public.my_org_ids() returns setof uuid language sql stable as $$ select org_id from org_members where user_id = auth.uid() $$;
create or replace function public.my_admin_org_ids() returns setof uuid language sql stable as $$ select org_id from org_members where user_id = auth.uid() $$;
create table public.invoices (
  id text not null, org_id uuid not null references public.organizations, number text, client_code text not null default 'C1',
  issued_at date not null default current_date, amount numeric not null default 0, status text not null default 'pending',
  primary key (org_id, id)
);
create table public.payments (
  id text not null, org_id uuid not null references public.organizations, created_by uuid, date date not null, client_code text not null,
  inv_id text, method text not null, ref text not null default '', amount numeric not null, status text not null default 'completed',
  source text not null default 'manual', primary key (org_id, id)
);
create table public.credit_notes (id text, org_id uuid, invoice_id text, amount numeric);
create table public.payment_sequences (org_id uuid primary key, last_number integer not null);

\i ../migrations/20260613_add_payment_settings.sql
\i ../migrations/20261028_invoice_settlement.sql
\i ../migrations/20261124_pispi_online_payments.sql

insert into public.organizations values ('00000000-0000-0000-0000-0000000000a1', 'Boutique Faso'), ('00000000-0000-0000-0000-0000000000b2', 'Autre');
insert into public.invoices (id, org_id, number, amount) values
  ('INV-1', '00000000-0000-0000-0000-0000000000a1', 'FA-2026-001', 10000),
  ('INV-2', '00000000-0000-0000-0000-0000000000a1', 'FA-2026-002', 5000),
  ('INV-3', '00000000-0000-0000-0000-0000000000a1', null, 7000);
insert into public.payments (id, org_id, date, client_code, inv_id, method, amount) values ('PAI-0007', '00000000-0000-0000-0000-0000000000a1', current_date, 'C1', null, 'cash', 1);
insert into public.invoice_payment_links (token, org_id, invoice_id) values
  ('tok1', '00000000-0000-0000-0000-0000000000a1', 'INV-1'),
  ('tok2', '00000000-0000-0000-0000-0000000000a1', 'INV-2'),
  ('tok3', '00000000-0000-0000-0000-0000000000a1', 'INV-3');

do $$
declare
  org constant uuid := '00000000-0000-0000-0000-0000000000a1';
  failures int := 0; r jsonb; r2 jsonb; ok boolean; v text; n numeric;
  ev jsonb;
  procedure_check text;
begin
  -- 1. A business cannot approve itself, nor set its commission
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  insert into org_payment_settings (org_id, online_mode, paygate_status, paygate_commission_pct)
  values (org, 'paygate', 'approved', 0);
  select paygate_status || '/' || paygate_commission_pct into v from org_payment_settings where org_id = org;
  if v <> 'none/1.00' then raise warning 'insert by a user: expected none/1.00, got %', v; failures := failures + 1; end if;
  update org_payment_settings set paygate_status = 'pending' where org_id = org; -- asking is allowed
  ok := false; begin update org_payment_settings set paygate_status = 'approved' where org_id = org; exception when insufficient_privilege then ok := true; end;
  if not ok then raise warning 'a user approved Paygate'; failures := failures + 1; end if;
  ok := false; begin update org_payment_settings set paygate_commission_pct = 0 where org_id = org; exception when insufficient_privilege then ok := true; end;
  if not ok then raise warning 'a user changed the commission'; failures := failures + 1; end if;

  -- 2. Pending: the page offers nothing online (no alias), and no collection is opened
  if payment_page('tok1') ->> 'mode' <> 'off' then raise warning 'pending Paygate, no alias: mode should be off'; failures := failures + 1; end if;
  if open_paygate_collection('tok1') ->> 'error' <> 'not_online' then raise warning 'collection opened before approval'; failures := failures + 1; end if;
  update org_payment_settings set pispi_alias = '3497a720-ab11-4973-9619-534e04f263a1' where org_id = org;
  r := payment_page('tok1');
  if r ->> 'mode' <> 'alias' or r ->> 'alias' is null or r ->> 'country' <> 'BF' then raise warning 'alias mode while waiting: %', r; failures := failures + 1; end if;

  -- 3. Progiciel approves (the service role / SQL editor): Paygate mode, page shows no alias
  perform set_config('request.jwt.claim.role', 'service_role', false);
  update org_payment_settings set paygate_status = 'approved' where org_id = org;
  r := payment_page('tok1');
  if r ->> 'mode' <> 'paygate' or r ? 'alias' and r ->> 'alias' is not null then raise warning 'paygate page: %', r; failures := failures + 1; end if;
  if (r ->> 'balance')::numeric <> 10000 or r ->> 'invoice' <> 'FA-2026-001' or r ->> 'seller' <> 'Boutique Faso' or r ->> 'state' <> 'open' then raise warning 'page content: %', r; failures := failures + 1; end if;
  update org_payment_settings set online_mode = 'off' where org_id = org;
  if payment_page('tok1') ->> 'mode' <> 'off' or open_paygate_collection('tok1') ->> 'error' <> 'not_online' then raise warning 'switched off but still online'; failures := failures + 1; end if;
  update org_payment_settings set online_mode = 'alias' where org_id = org;
  if payment_page('tok1') ->> 'mode' <> 'paygate' then raise warning 'on + approved: Paygate'; failures := failures + 1; end if;
  if payment_page('nope') is not null then raise warning 'unknown token answered'; failures := failures + 1; end if;
  update invoice_payment_links set active = false where token = 'tok3';
  if payment_page('tok3') is not null then raise warning 'a turned-off link still answers'; failures := failures + 1; end if;

  -- 4. Collections: one reference while it is open, for exactly what is left to pay
  r := open_paygate_collection('tok1');
  r2 := open_paygate_collection('tok1');
  if r ->> 'reference' is null or r ->> 'reference' <> r2 ->> 'reference' or (r ->> 'amount')::numeric <> 10000 then raise warning 'reuse: % / %', r, r2; failures := failures + 1; end if;
  perform start_paygate_collection(r ->> 'reference', 'pg001', '{"alias":"x","countryCode":"BF","qrType":"DYNAMIC","referenceLabel":"PG001","amount":10000}', now() + interval '3 hours', 'processing');
  r2 := open_paygate_collection('tok1');
  if r2 ->> 'paygateId' <> 'pg001' or r2 -> 'qr' ->> 'referenceLabel' <> 'PG001' then raise warning 'started collection not reused: %', r2; failures := failures + 1; end if;

  -- 5. Paygate pays 4 000 (partial): recorded once, invoice stays open, 1 % commission
  -- (a new collection for 4 000 to show the partial path: the business's own amount changed by a credit note)
  insert into credit_notes values ('AV-1', org, 'INV-1', 6000);
  r := open_paygate_collection('tok1');
  if (r ->> 'amount')::numeric <> 4000 or r ->> 'reference' = r2 ->> 'reference' then raise warning 'new balance, new reference: %', r; failures := failures + 1; end if;
  perform start_paygate_collection(r ->> 'reference', 'pg002', null, now() + interval '3 hours', 'processing');
  ev := jsonb_build_object('id', 'evt_pg002_1', 'type', 'payment.completed', 'data', jsonb_build_object('id', 'pg002', 'reference', r ->> 'reference', 'amount', 4000, 'status', 'completed', 'settledAt', 1793491200000));
  r2 := apply_paygate_event(ev);
  if r2 ->> 'recorded' <> 'PAI-0008' then raise warning 'payment number after PAI-0007: %', r2; failures := failures + 1; end if;
  if (select status from invoices where org_id = org and id = 'INV-1') <> 'paid' then raise warning 'credited 6 000 + paid 4 000 of 10 000: should be paid'; failures := failures + 1; end if;
  select commission into n from incoming_payments where external_ref = 'pg002';
  if n <> 40 then raise warning 'commission 1 %% of 4 000: %', n; failures := failures + 1; end if;
  if (select net from incoming_payments where external_ref = 'pg002') <> 3960 then raise warning 'net'; failures := failures + 1; end if;
  if (select method || '/' || source || '/' || date from payments where id = 'PAI-0008') <> 'pispi/online/2026-11-01' then raise warning 'payment row: %', (select row_to_json(p) from payments p where id = 'PAI-0008'); failures := failures + 1; end if;

  -- 6. The same event again, or the same payment under another event id: nothing changes
  if apply_paygate_event(ev) ->> 'duplicate' <> 'true' then raise warning 'repeated event applied'; failures := failures + 1; end if;
  if apply_paygate_event(ev || '{"id":"evt_pg002_2"}') ->> 'duplicate_payment' <> 'true' then raise warning 'same payment counted twice'; failures := failures + 1; end if;
  if (select count(*) from payments where inv_id = 'INV-1') <> 1 or (select count(*) from incoming_payments) <> 1 then raise warning 'counted twice'; failures := failures + 1; end if;

  -- 7. A payment for an invoice already settled waits for a person; a mismatch settles nothing
  r := open_paygate_collection('tok2');
  perform start_paygate_collection(r ->> 'reference', 'pg003', null, now() + interval '3 hours', 'processing');
  update invoices set status = 'paid' where org_id = org and id = 'INV-2'; -- paid by hand meanwhile
  r2 := apply_paygate_event(jsonb_build_object('id', 'evt_pg003_1', 'type', 'payment.completed', 'data', jsonb_build_object('id', 'pg003', 'reference', r ->> 'reference', 'amount', 5000)));
  if r2 ->> 'to_check' <> 'true' or (select status || ':' || detail from incoming_payments where external_ref = 'pg003') <> 'to_check:Facture déjà réglée ou fermée' then raise warning 'already settled: %', r2; failures := failures + 1; end if;
  if (select count(*) from payments where inv_id = 'INV-2') <> 0 then raise warning 'a payment recorded on a settled invoice'; failures := failures + 1; end if;
  r2 := apply_paygate_event(jsonb_build_object('id', 'evt_pg003_m', 'type', 'payment.mismatch', 'data', jsonb_build_object('id', 'pg003', 'reference', r ->> 'reference', 'amount', 5000)));
  if (select status from incoming_payments where external_ref = 'pg003:mismatch') <> 'to_check' then raise warning 'mismatch not shown'; failures := failures + 1; end if;
  if apply_paygate_event('{"id":"evt_x","type":"payment.completed","data":{"id":"pgx","reference":"bl_unknown","amount":1}}') ->> 'ignored' <> 'unknown_reference' then raise warning 'unknown reference'; failures := failures + 1; end if;
  if apply_paygate_event('{"id":"evt_ping","type":"ping"}') ->> 'ignored' <> 'no_payment' then raise warning 'ping'; failures := failures + 1; end if;

  -- 8. Nothing left to pay: no collection
  if open_paygate_collection('tok1') ->> 'error' <> 'not_open' then raise warning 'collection on a paid invoice'; failures := failures + 1; end if;
  if payment_page('tok1') ->> 'state' <> 'paid' then raise warning 'paid invoice page'; failures := failures + 1; end if;

  if failures > 0 then raise exception '% check(s) failed', failures; end if;
end;
$$;
