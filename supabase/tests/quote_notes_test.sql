-- Checks 20261123_quote_notes.sql on a minimal schema: notes are a JSON object
-- of bounded size; the discount stays between 0 and 100 and defaults to 0.
create table public.quotes (id text primary key, status text not null default 'draft');
insert into public.quotes (id) values ('QUO-0001');

\i ../migrations/20261123_quote_notes.sql
-- Twice: safe to run again
\i ../migrations/20261123_quote_notes.sql

do $$
declare
  failures int := 0;
begin
  if (select discount_pct from quotes where id = 'QUO-0001') <> 0 then
    failures := failures + 1; raise warning 'older quote has a discount';
  end if;
  insert into quotes (id, notes, discount_pct) values ('QUO-0002', '{"type":"doc","content":[]}', 5);
  begin
    insert into quotes (id, notes) values ('X-1', '"texte"');
    failures := failures + 1; raise warning 'a JSON string was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into quotes (id, notes) values ('X-2', jsonb_build_object('type', 'doc', 'text', repeat('a', 20001)));
    failures := failures + 1; raise warning 'oversized notes were accepted';
  exception when check_violation then null;
  end;
  begin
    insert into quotes (id, discount_pct) values ('X-3', 101);
    failures := failures + 1; raise warning 'a discount above 100 percent was accepted';
  exception when check_violation then null;
  end;
  if failures > 0 then raise exception '% quote notes check(s) failed', failures; end if;
end $$;
