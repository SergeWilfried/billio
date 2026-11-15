-- Checks 20261122_credit_note_documents.sql on a minimal schema: drafts get no
-- number and don't count; issuing needs a nature and a reason, numbers it,
-- stamps the issuer and counts it; RAN is refused after a payment; issued
-- credit notes are frozen and can't be deleted, drafts can.
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
insert into auth.users values ('00000000-0000-0000-0000-00000000aaaa', 'awa@example.invalid', '{"first_name": "Awa", "last_name": "Ouédraogo"}');
create table public.organizations (id uuid primary key, name text);
create table public.invoices (
  id text not null, org_id uuid not null references public.organizations, status text not null default 'pending',
  amount numeric not null default 0, number text, primary key (org_id, id)
);
create table public.line_items (
  id uuid primary key, org_id uuid, invoice_id text, qty numeric
);
create table public.payments (
  id text, org_id uuid, inv_id text, amount numeric, status text
);
create table public.credit_notes (
  id text not null, org_id uuid not null references public.organizations, invoice_id text not null,
  client_code text not null default 'C1', subject text not null default '', issued_at date not null default current_date,
  amount numeric not null default 0 check (amount >= 0), reason text not null default '', primary key (org_id, id)
);
-- Stubs for the policy's helpers (RLS itself is not exercised here)
create function public.my_writer_org_ids() returns setof uuid language sql as $$ select id from public.organizations $$;
create function public.sees_all_records(uuid) returns boolean language sql as $$ select true $$;
create function public.owns_invoice(uuid, text) returns boolean language sql as $$ select true $$;
-- From 20261028_invoice_settlement.sql
create function public.refresh_invoice_status(p_org_id uuid, p_invoice_id text) returns text language plpgsql as $$
begin
  update invoices set status = 'paid' where org_id = p_org_id and id = p_invoice_id
     and status in ('pending', 'overdue') and invoice_balance(p_org_id, p_invoice_id) <= 0;
  return (select status from invoices where org_id = p_org_id and id = p_invoice_id);
end $$;

insert into public.organizations values ('00000000-0000-0000-0000-0000000000a1', 'A');
insert into public.invoices (id, org_id, amount) values
  ('F-1', '00000000-0000-0000-0000-0000000000a1', 1000),
  ('F-2', '00000000-0000-0000-0000-0000000000a1', 500);
-- Issued before: keeps its number
insert into public.credit_notes (id, org_id, invoice_id, amount, reason) values ('AV-0001', '00000000-0000-0000-0000-0000000000a1', 'F-1', 100, 'ancien');

\i ../migrations/20261113_invoice_numbering.sql
\i ../migrations/20261122_credit_note_documents.sql
-- Twice: safe to run again
\i ../migrations/20261122_credit_note_documents.sql

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000000a1';
  y constant text := extract(year from now() at time zone 'UTC')::text;
  failures int := 0;
  r record;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aaaa', true);

  -- Older credit note: issued, with its number, and counted
  select * into r from credit_notes where id = 'AV-0001';
  if r.status <> 'issued' or r.number is distinct from 'AV-0001' then
    failures := failures + 1; raise warning 'old credit note changed: % %', r.status, r.number;
  end if;
  if invoice_balance(a, 'F-1') <> 900 then failures := failures + 1; raise warning 'old credit note not counted'; end if;

  -- A draft: no number, no issuer, not counted, even above the invoice total
  insert into credit_notes (id, org_id, invoice_id, amount, status, nature, lines)
    values ('AV-D1', a, 'F-1', 5000, 'draft', 'RAM', '[{"desc":"x","qty":1,"price":5000}]');
  select * into r from credit_notes where id = 'AV-D1';
  if r.number is not null or r.issued_by is not null or r.issued_ts is not null then
    failures := failures + 1; raise warning 'draft got a number or issuer';
  end if;
  if invoice_balance(a, 'F-1') <> 900 then failures := failures + 1; raise warning 'draft counted in the balance'; end if;

  -- Issuing above what is left: refused
  begin
    update credit_notes set status = 'issued', reason = 'trop' where id = 'AV-D1';
    failures := failures + 1; raise warning 'credit above the invoice total was issued';
  exception when raise_exception then null;
  end;

  -- Issuing without a reason, or without a nature: refused
  update credit_notes set amount = 200 where id = 'AV-D1';
  begin
    update credit_notes set status = 'issued' where id = 'AV-D1';
    failures := failures + 1; raise warning 'issued without a reason';
  exception when raise_exception then null;
  end;
  begin
    insert into credit_notes (id, org_id, invoice_id, amount, status, reason) values ('AV-X', a, 'F-1', 10, 'issued', 'sans nature');
    failures := failures + 1; raise warning 'issued without a nature';
  exception when raise_exception then null;
  end;

  -- Issued: numbered, stamped, counted
  update credit_notes set status = 'issued', reason = 'Formation reportée' where id = 'AV-D1';
  select * into r from credit_notes where id = 'AV-D1';
  if r.number is distinct from format('AV-%s-0001', y) then failures := failures + 1; raise warning 'issued number: %', r.number; end if;
  if r.issued_by_name is distinct from 'Awa Ouédraogo' or r.issued_ts is null then
    failures := failures + 1; raise warning 'issuer not stamped: %', r.issued_by_name;
  end if;
  if invoice_balance(a, 'F-1') <> 700 then failures := failures + 1; raise warning 'issued credit note not counted'; end if;

  -- Frozen once issued; can't go back to draft; can't be deleted
  begin
    update credit_notes set amount = 1 where id = 'AV-D1';
    failures := failures + 1; raise warning 'issued amount changed';
  exception when sqlstate 'BL002' then null;
  end;
  begin
    update credit_notes set status = 'draft' where id = 'AV-D1';
    failures := failures + 1; raise warning 'issued credit note went back to draft';
  exception when sqlstate 'BL002' then null;
  end;
  begin
    delete from credit_notes where id = 'AV-D1';
    failures := failures + 1; raise warning 'issued credit note deleted';
  exception when sqlstate 'BL002' then null;
  end;
  -- Stamps can't be rewritten either
  update credit_notes set issued_by_name = 'Faux' where id = 'AV-D1';
  if (select issued_by_name from credit_notes where id = 'AV-D1') <> 'Awa Ouédraogo' then
    failures := failures + 1; raise warning 'issuer rewritten';
  end if;

  -- A draft can be deleted
  insert into credit_notes (id, org_id, invoice_id, amount, status) values ('AV-D2', a, 'F-1', 10, 'draft');
  delete from credit_notes where id = 'AV-D2';
  if exists (select 1 from credit_notes where id = 'AV-D2') then failures := failures + 1; raise warning 'draft not deleted'; end if;

  -- RAN: refused once a payment was received, allowed before
  insert into payments values ('P-1', a, 'F-1', 50, 'completed');
  begin
    insert into credit_notes (id, org_id, invoice_id, amount, status, nature, reason) values ('AV-R1', a, 'F-1', 10, 'issued', 'RAN', 'annulation');
    failures := failures + 1; raise warning 'RAN issued after a payment';
  exception when raise_exception then null;
  end;
  insert into credit_notes (id, org_id, invoice_id, amount, status, nature, reason) values ('AV-R2', a, 'F-2', 500, 'issued', 'RAN', 'annulation');
  if (select number from credit_notes where id = 'AV-R2') is distinct from format('AV-%s-0002', y) then
    failures := failures + 1; raise warning 'numbers skipped after refusals: %', (select number from credit_notes where id = 'AV-R2');
  end if;
  -- Fully credited: the invoice is marked paid
  if (select status from invoices where id = 'F-2') <> 'paid' then failures := failures + 1; raise warning 'fully credited invoice not settled'; end if;

  -- Outside the app (no role): maintenance can fix an issued row
  perform set_config('request.jwt.claim.role', '', true);
  update credit_notes set reason = 'corrigé' where id = 'AV-D1';
  if (select reason from credit_notes where id = 'AV-D1') <> 'corrigé' then failures := failures + 1; raise warning 'maintenance blocked'; end if;

  -- Subject and organisation are frozen too (the PDF prints the subject of an amount-only note)
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    update credit_notes set subject = 'autre' where id = 'AV-0001';
    failures := failures + 1; raise warning 'issued subject changed';
  exception when sqlstate 'BL002' then null;
  end;
  insert into organizations values ('00000000-0000-0000-0000-0000000000b2', 'B');
  begin
    update credit_notes set org_id = '00000000-0000-0000-0000-0000000000b2' where id = 'AV-0001';
    failures := failures + 1; raise warning 'issued credit note moved to another organisation';
  exception when sqlstate 'BL002' then null;
  end;

  -- Per line: two notes can't credit the same invoice line beyond its quantity
  insert into invoices (id, org_id, amount) values ('F-3', a, 200);
  insert into line_items values ('00000000-0000-0000-0000-00000000000a', a, 'F-3', 1), ('00000000-0000-0000-0000-00000000000b', a, 'F-3', 1);
  insert into credit_notes (id, org_id, invoice_id, amount, status, nature, reason, lines)
    values ('AV-L1', a, 'F-3', 100, 'issued', 'COR', 'ligne A', '[{"desc":"A","qty":1,"price":100,"sourceId":"00000000-0000-0000-0000-00000000000a"}]');
  begin
    insert into credit_notes (id, org_id, invoice_id, amount, status, nature, reason, lines)
      values ('AV-L2', a, 'F-3', 100, 'issued', 'COR', 'ligne A encore', '[{"desc":"A","qty":1,"price":100,"sourceId":"00000000-0000-0000-0000-00000000000a"}]');
    failures := failures + 1; raise warning 'an invoice line was credited twice';
  exception when raise_exception then null;
  end;
  insert into credit_notes (id, org_id, invoice_id, amount, status, nature, reason, lines)
    values ('AV-L3', a, 'F-3', 100, 'issued', 'COR', 'ligne B', '[{"desc":"B","qty":1,"price":100,"sourceId":"00000000-0000-0000-0000-00000000000b"}]');

  -- A credited invoice keeps its lines: replacing them (new ids) is refused,
  -- so line A can't be credited again under a new id
  begin
    delete from line_items where invoice_id = 'F-3';
    failures := failures + 1; raise warning 'lines of a credited invoice deleted';
  exception when sqlstate 'BL002' then null;
  end;
  begin
    insert into line_items values ('00000000-0000-0000-0000-00000000000c', a, 'F-3', 1);
    failures := failures + 1; raise warning 'line added to a credited invoice';
  exception when sqlstate 'BL002' then null;
  end;
  -- An invoice without credit notes can still be corrected
  insert into invoices (id, org_id, amount) values ('F-4', a, 50);
  insert into line_items values ('00000000-0000-0000-0000-00000000000d', a, 'F-4', 1);
  delete from line_items where id = '00000000-0000-0000-0000-00000000000d';

  -- Shape of the lines
  begin
    insert into credit_notes (id, org_id, invoice_id, status, lines) values ('AV-L', a, 'F-1', 'draft', '{"a":1}');
    failures := failures + 1; raise warning 'lines as an object accepted';
  exception when check_violation then null;
  end;

  if failures > 0 then raise exception '% credit note check(s) failed', failures; end if;
end $$;
