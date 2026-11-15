-- Credit notes written in the invoice editor (PRO-168, PRO-143).
--
-- A credit note is a kind of invoice: it has a draft, then is issued.
--   status        'draft' | 'issued'. Rows from before this migration are issued.
--   nature        COR (correction), RAN (cancellation), RAM (after payment or
--                 delivery), RRR (discount after the fact). Required to issue;
--                 older credit notes have none.
--   lines         the credited lines, as JSON: [{ desc, unit, qty, price,
--                 productId?, sourceId? }]. Older credit notes have [].
--   discount_pct  the original invoice's discount, applied to these lines.
--   issued_ts, issued_by, issued_by_name: when and by whom it was issued (DGI
--                 mentions), set by the database, never by the app.
--
-- Only issued credit notes count: the number (AV-YYYY-NNNN) is given at issue,
-- the total check and the invoice balance ignore drafts. At issue, each
-- credited line is also checked against what is left of its invoice line. A draft can be changed
-- and deleted; an issued credit note can't. RAN can't be issued on an invoice
-- that has received a payment.

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table public.credit_notes add column if not exists status text not null default 'issued';
alter table public.credit_notes add column if not exists nature text;
alter table public.credit_notes add column if not exists lines jsonb not null default '[]'::jsonb;
alter table public.credit_notes add column if not exists discount_pct numeric not null default 0;
alter table public.credit_notes add column if not exists issued_ts timestamptz;
alter table public.credit_notes add column if not exists issued_by uuid references auth.users(id) on delete set null;
alter table public.credit_notes add column if not exists issued_by_name text;

alter table public.credit_notes drop constraint if exists credit_notes_status_check;
alter table public.credit_notes add constraint credit_notes_status_check check (status in ('draft', 'issued'));
alter table public.credit_notes drop constraint if exists credit_notes_nature_check;
alter table public.credit_notes add constraint credit_notes_nature_check check (nature is null or nature in ('COR', 'RAN', 'RAM', 'RRR'));
alter table public.credit_notes drop constraint if exists credit_notes_lines_shape;
alter table public.credit_notes add constraint credit_notes_lines_shape
  check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200 and length(lines::text) <= 100000);
alter table public.credit_notes drop constraint if exists credit_notes_discount_range;
alter table public.credit_notes add constraint credit_notes_discount_range check (discount_pct >= 0 and discount_pct <= 100);

-- ── Numbers: at issue only ───────────────────────────────────────────────────
create or replace function public.assign_credit_note_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now() at time zone 'UTC')::integer;
  v_next integer;
begin
  if tg_op = 'UPDATE' and old.number is not null then
    new.number := old.number;
    return new;
  end if;
  if new.status = 'draft' then
    new.number := null;
    return new;
  end if;

  insert into credit_note_number_series as s (org_id, year, last_number)
  values (new.org_id, v_year, 1)
  on conflict (org_id, year) do update set last_number = s.last_number + 1
  returning last_number into v_next;

  new.number := format('AV-%s-%s', v_year, case when v_next > 9999 then v_next::text else lpad(v_next::text, 4, '0') end);
  return new;
end;
$$;

-- ── Balance and total: issued credit notes only ──────────────────────────────
create or replace function public.invoice_balance(p_org_id uuid, p_invoice_id text)
returns numeric
language sql
stable
set search_path = public
as $$
  select i.amount
       - coalesce((select sum(p.amount) from payments p
                   where p.org_id = i.org_id and p.inv_id = i.id and p.status = 'completed'), 0)
       - coalesce((select sum(c.amount) from credit_notes c
                   where c.org_id = i.org_id and c.invoice_id = i.id and c.status = 'issued'), 0)
  from invoices i
  where i.org_id = p_org_id and i.id = p_invoice_id;
$$;

create or replace function public.check_credit_note_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_amount   numeric;
  v_credited numeric;
begin
  if new.status <> 'issued' then return new; end if;
  -- Already issued: frozen (credit_note_rules), nothing new to check
  if tg_op = 'UPDATE' and old.status = 'issued' then return new; end if;

  select amount into v_amount
    from invoices
   where org_id = new.org_id and id = new.invoice_id
   for update;

  select coalesce(sum(amount), 0) into v_credited
    from credit_notes
   where org_id = new.org_id and invoice_id = new.invoice_id and status = 'issued' and id <> new.id;

  if v_credited + new.amount > v_amount then
    raise exception 'Credit notes (% + %) exceed invoice total %', v_credited, new.amount, v_amount
      using errcode = 'P0001', hint = 'exceeds_invoice_total';
  end if;

  -- Per line, still under the invoice lock: every credited line must still be
  -- on the invoice (a note written before the invoice's lines were replaced
  -- is refused: reopen it)...
  if exists (
    select 1
      from jsonb_array_elements(new.lines) l
     where l ->> 'sourceId' is not null
       and not exists (select 1 from line_items li
                        where li.org_id = new.org_id and li.invoice_id = new.invoice_id and li.id::text = l ->> 'sourceId')
  ) then
    raise exception 'A credited line is no longer on the invoice'
      using errcode = 'P0001', hint = 'stale_line';
  end if;

  -- ...and what this note credits on each line, plus what issued notes
  -- already credited, stays within the line's quantity.
  if exists (
    select 1
      from (select l ->> 'sourceId' as src, sum((l ->> 'qty')::numeric) as qty
              from jsonb_array_elements(new.lines) l
             where l ->> 'sourceId' is not null
             group by 1) s
      join line_items li
        on li.org_id = new.org_id and li.invoice_id = new.invoice_id and li.id::text = s.src
     where s.qty + coalesce((
             select sum((x ->> 'qty')::numeric)
               from credit_notes c, jsonb_array_elements(c.lines) x
              where c.org_id = new.org_id and c.invoice_id = new.invoice_id
                and c.status = 'issued' and c.id <> new.id
                and x ->> 'sourceId' = s.src), 0) > li.qty
  ) then
    raise exception 'A credited line exceeds what is left of its invoice line'
      using errcode = 'P0001', hint = 'exceeds_line_quantity';
  end if;
  return new;
end;
$$;

drop trigger if exists credit_notes_check_total on public.credit_notes;
create trigger credit_notes_check_total
  before insert or update on public.credit_notes
  for each row execute function public.check_credit_note_total();

create or replace function public.after_credit_note_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status <> 'issued') then
    perform refresh_invoice_status(new.org_id, new.invoice_id);
  end if;
  return new;
end;
$$;

drop trigger if exists credit_notes_refresh_invoice on public.credit_notes;
create trigger credit_notes_refresh_invoice
  after insert or update on public.credit_notes
  for each row execute function public.after_credit_note_insert();

-- ── Issue rules, freezing, and who issued it ─────────────────────────────────
create or replace function public.credit_note_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_app boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if tg_op = 'UPDATE' and old.status = 'issued' then
    -- Issued: frozen for the app (maintenance outside it can still fix a row)
    if v_app and (new.org_id, new.status, new.invoice_id, new.client_code, new.subject, new.amount, new.reason, new.nature, new.lines, new.discount_pct, new.issued_at)
         is distinct from (old.org_id, old.status, old.invoice_id, old.client_code, old.subject, old.amount, old.reason, old.nature, old.lines, old.discount_pct, old.issued_at) then
      raise exception 'issued_document_locked'
        using errcode = 'BL002', detail = 'An issued credit note cannot be changed; issue another one.';
    end if;
    new.issued_ts := old.issued_ts;
    new.issued_by := old.issued_by;
    new.issued_by_name := old.issued_by_name;
    return new;
  end if;

  if new.status = 'draft' then
    new.issued_ts := null;
    new.issued_by := null;
    new.issued_by_name := null;
    return new;
  end if;

  -- Issued now (a new row, or a draft being issued)
  if v_app then
    if new.nature is null then
      raise exception 'credit_note_nature_required' using errcode = 'P0001', hint = 'nature_required';
    end if;
    if btrim(coalesce(new.reason, '')) = '' then
      raise exception 'credit_note_reason_required' using errcode = 'P0001', hint = 'reason_required';
    end if;
    if new.nature = 'RAN' and exists (
      select 1 from payments p where p.org_id = new.org_id and p.inv_id = new.invoice_id and p.status = 'completed'
    ) then
      raise exception 'credit_note_ran_after_payment'
        using errcode = 'P0001', hint = 'ran_after_payment', detail = 'RAN (annulation) is only for an invoice with no payment; use RAM.';
    end if;
  end if;

  new.issued_ts := now();
  new.issued_by := v_uid;
  new.issued_by_name := null;
  if v_uid is not null then
    select coalesce(
             nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
             nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
             split_part(u.email, '@', 1))
      into new.issued_by_name
      from auth.users u
     where u.id = v_uid;
  end if;
  return new;
end;
$$;

drop trigger if exists credit_note_rules on public.credit_notes;
-- Before triggers run in name order: credit_note_number, credit_note_rules, then
-- credit_notes_check_total. An error in any of them rolls the number back.
create trigger credit_note_rules
  before insert or update on public.credit_notes
  for each row execute function public.credit_note_rules();

-- ── Deleting: drafts only ────────────────────────────────────────────────────
create or replace function public.protect_issued_documents()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return old;
  end if;
  -- Separate branches: the two tables don't share their status values
  if tg_table_name = 'credit_notes' then
    if old.status <> 'draft' or old.number is not null then
      raise exception 'issued_document_locked'
        using errcode = 'BL002', detail = 'Credit notes cannot be deleted.';
    end if;
  elsif old.number is not null or old.status <> 'draft' then
    raise exception 'issued_document_locked'
      using errcode = 'BL002', detail = 'Issued invoices cannot be deleted; cancel them with a credit note.';
  end if;
  return old;
end;
$$;

-- ── Lines of a credited invoice: kept as credited ───────────────────────────
-- Credited lines point to their invoice line (lines[].sourceId). Correcting an
-- issued invoice replaces its lines with new ids, which would let a line be
-- credited again: once an issued credit note exists, the invoice's lines can't
-- change from the app (corrections go through credit notes).
create or replace function public.protect_credited_invoice_lines()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_inv text := coalesce(new.invoice_id, old.invoice_id);
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or v_inv is null then
    return coalesce(new, old);
  end if;
  -- A line never moves to another invoice (the app never does it): a move
  -- would lock only one of the two invoices
  if tg_op = 'UPDATE' and (new.org_id, new.invoice_id) is distinct from (old.org_id, old.invoice_id) then
    raise exception 'line_item_reassigned'
      using errcode = 'BL002', detail = 'A line cannot move to another invoice.';
  end if;
  -- The invoice lock that issuing a credit note takes: a line change and an
  -- issue on the same invoice happen one after the other, never interleaved
  perform 1 from invoices where org_id = v_org and id = v_inv for update;
  if exists (select 1 from credit_notes c where c.org_id = v_org and c.invoice_id = v_inv and c.status = 'issued')
     or (tg_op = 'UPDATE' and old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id
         and exists (select 1 from credit_notes c where c.org_id = old.org_id and c.invoice_id = old.invoice_id and c.status = 'issued')) then
    raise exception 'credited_invoice_lines_locked'
      using errcode = 'BL002', detail = 'This invoice has a credit note: its lines can no longer change.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists protect_credited_invoice_lines on public.line_items;
create trigger protect_credited_invoice_lines
  before insert or update or delete on public.line_items
  for each row execute function public.protect_credited_invoice_lines();

-- Writers delete their drafts (issued ones are refused above); admins already may
drop policy if exists "credit_notes: writers delete drafts" on public.credit_notes;
create policy "credit_notes: writers delete drafts" on public.credit_notes for delete
  using (
    status = 'draft'
    and org_id in (select public.my_writer_org_ids())
    and (public.sees_all_records(org_id) or public.owns_invoice(org_id, invoice_id))
  );
