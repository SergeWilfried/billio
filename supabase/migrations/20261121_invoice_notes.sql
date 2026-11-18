-- Notes and conditions on invoices (PRO-167): the rich text typed in the
-- invoice editor, kept as the editor's JSON (Tiptap), printed on the invoice
-- and its PDF.
--
-- * At most 20 000 characters of JSON, and always a JSON object.
-- * Once the invoice is issued, its notes stay as they were printed: a change
--   from the app is ignored (the row keeps the issued notes).
-- Safe to run more than once.

alter table public.invoices add column if not exists notes jsonb;

alter table public.invoices drop constraint if exists invoices_notes_shape;
alter table public.invoices add constraint invoices_notes_shape
  check (notes is null or (jsonb_typeof(notes) = 'object' and octet_length(notes::text) <= 20000));

create or replace function public.freeze_issued_invoice_notes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Issued: the printed notes don't change (maintenance outside the app may)
  if old.status <> 'draft' and new.notes is distinct from old.notes
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.notes := old.notes;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_notes_freeze on public.invoices;
create trigger invoice_notes_freeze
  before update on public.invoices
  for each row execute function public.freeze_issued_invoice_notes();
