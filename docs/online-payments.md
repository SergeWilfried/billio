# Online payments by PI-SPI (PRO-189, PRO-187)

A client pays an invoice from any bank or mobile-money app connected to PI-SPI (BCEAO instant payments). The QR
code on the invoice PDF opens the invoice's payment page, `/payer/<token>`, which shows what is left to pay when it
is opened.

In **Paramètres › Paiements en ligne**, a business turns online payment on and gives its PI-SPI alias, nothing
more. How its payments are then confirmed is Billio's decision:

| `paygate_status` | How the client pays | How the payment reaches the invoice | Commission |
|---|---|---|---|
| not `approved` | a PI-SPI QR code for the business's own alias, with the invoice number as reference | matched from the statement (PRO-175; by hand until then) | none |
| `approved` | a PI-SPI QR code from Paygate | recorded by itself when Paygate confirms it | `paygate_commission_pct` (1 %, provisional) |

**Paygate is internal.** Users never see its name: in the app, a confirmed payment is « en ligne (PI-SPI) »,
confirmed by Billio. Approving a business, suspending it and its commission are set by Billio only; the database
refuses them from the app. Payouts go to the business's own alias.

## Moving parts

- `supabase/migrations/20261124_pispi_online_payments.sql`
  - the settings columns (`online_mode`, `pispi_alias`, `pispi_country`, `paygate_status`, `paygate_commission_pct`), with a trigger that keeps the last two Billio's;
  - `invoice_payment_links`, one unguessable token per invoice, which can be turned off;
  - `paygate_collections`, `paygate_events` and `incoming_payments`;
  - server-side functions, callable with the service role only: `payment_page`, `open_paygate_collection`, `start_paygate_collection`, `apply_paygate_event`.
- `worker/paygate.ts`: `GET /api/pay/:token`, `POST /api/pay/:token/collect`, `POST /api/paygate/webhook`.
- `src/pages/PayPage.tsx`: the public page.
  - The QR payload is built with `@pi-spi/qrcode`, the BCEAO SDK, and drawn as SVG.
  - It is checked to decode as a valid PI-SPI payload.

Money is counted once:
- a collection's reference is reused while it is open, and Paygate answers a repeated reference with the same payment;
- an event id is applied once;
- a Paygate payment id is recorded once per business;
- a payment for an invoice that is already settled, or for more than its balance, is not recorded on it. It is listed « À vérifier ».
- `payment.mismatch` (wrong amount or route) settles nothing and is listed « À vérifier ».

## Set up (once)

1. Apply the migration: `npx supabase db push`, or run it in the SQL editor.
2. In Paygate, create the product `billio`:
   - webhook URL: `https://<billio host>/api/paygate/webhook`;
   - enable its PI-SPI wallet;
   - create an API key and reveal the webhook secret.
3. On the Billio Worker, set these secrets with `npx wrangler secret put …`:
   - `SUPABASE_SERVICE_ROLE_KEY`;
   - `PAYGATE_API_KEY`;
   - `PAYGATE_WEBHOOK_SECRET`.

   Set the var `PAYGATE_URL` in `wrangler.toml`. Without them the page says online payment is not available yet, and nothing is charged.
4. To approve a business, after checking its KYB documents, run in the SQL editor:
   `update org_payment_settings set paygate_status = 'approved' where org_id = '<org id>';`
   Change `paygate_commission_pct` the same way.

## Not yet

- **Accounting entry** for a Paygate payment (521 net / 631 commission / 411 invoice). Server-recorded payments do not post entries yet.
- **Monthly commission invoice.**
- **PI-SPI payout from Paygate.** Payouts are made by hand meanwhile, and Billio shows « Reversement en attente ».
- **Statement matching** for the alias mode (PRO-175).
