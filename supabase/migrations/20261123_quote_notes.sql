-- Quotes in the invoice editor (PRO-185): a quote gets the same notes and
-- conditions as an invoice (the editor's rich text, as JSON) and the same
-- invoice-level discount. Both are carried into the invoice when the quote
-- is converted.
--
-- * notes: at most 20 000 characters of JSON, and always a JSON object (as
--   invoices.notes, 20261121_invoice_notes.sql).
-- * discount_pct: 0 to 100; quotes from before this migration have none.
-- Safe to run more than once.

alter table public.quotes add column if not exists notes jsonb;
alter table public.quotes add column if not exists discount_pct numeric not null default 0;

alter table public.quotes drop constraint if exists quotes_notes_shape;
alter table public.quotes add constraint quotes_notes_shape
  check (notes is null or (jsonb_typeof(notes) = 'object' and octet_length(notes::text) <= 20000));

alter table public.quotes drop constraint if exists quotes_discount_range;
alter table public.quotes add constraint quotes_discount_range
  check (discount_pct >= 0 and discount_pct <= 100);
