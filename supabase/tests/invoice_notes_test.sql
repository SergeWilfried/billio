-- Checks 20261121_invoice_notes.sql on a minimal schema: notes are a JSON
-- object of bounded size, editable on drafts and frozen once issued.
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create table public.invoices (
  id text primary key, status text not null default 'draft'
);

\i ../migrations/20261121_invoice_notes.sql
-- Twice: the migration is safe to run again
\i ../migrations/20261121_invoice_notes.sql

do $$
declare
  failures int := 0;
  n1 constant jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Merci"}]}]}';
  n2 constant jsonb := '{"type":"doc","content":[]}';
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into invoices (id, notes) values ('D-1', n1);
  update invoices set notes = n2 where id = 'D-1';
  if (select notes from invoices where id = 'D-1') is distinct from n2 then
    failures := failures + 1; raise warning 'draft notes not saved';
  end if;

  -- Issued: a later change from the app is ignored
  update invoices set status = 'pending' where id = 'D-1';
  update invoices set notes = n1 where id = 'D-1';
  if (select notes from invoices where id = 'D-1') is distinct from n2 then
    failures := failures + 1; raise warning 'issued notes changed';
  end if;
  update invoices set notes = null where id = 'D-1';
  if (select notes from invoices where id = 'D-1') is null then
    failures := failures + 1; raise warning 'issued notes cleared';
  end if;

  -- Outside the app (no role): maintenance can still fix them
  perform set_config('request.jwt.claim.role', '', true);
  update invoices set notes = n1 where id = 'D-1';
  if (select notes from invoices where id = 'D-1') is distinct from n1 then
    failures := failures + 1; raise warning 'maintenance could not change notes';
  end if;

  -- Shape: an object only, and not too large
  begin
    insert into invoices (id, notes) values ('X-1', '"texte"');
    failures := failures + 1; raise warning 'a JSON string was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into invoices (id, notes) values ('X-2', jsonb_build_object('type', 'doc', 'text', repeat('a', 20001)));
    failures := failures + 1; raise warning 'oversized notes were accepted';
  exception when check_violation then null;
  end;

  if failures > 0 then raise exception '% invoice notes check(s) failed', failures; end if;
end $$;
