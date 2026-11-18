// What a printed document adds up to (InvoicePDF), kept apart so it can be tested.

import { vatOn } from '@/lib/vat';

/**
 * Discount, VAT and total of a document. A credit note passes its stored total
 * (`storedTotal`): the total printed is that one, and the rounding left over
 * goes into the VAT (or the discount, without VAT), so a note whose total was
 * reconciled with the invoice, or that has only an amount, prints what it is.
 */
export function documentAmounts(subtotal: number, discountPct: number, showVat: boolean, storedTotal?: number) {
  let discountAmt = Math.round(subtotal * (discountPct / 100));
  let discountedSub = subtotal - discountAmt;
  let tax = vatOn(discountedSub, showVat);
  if (storedTotal !== undefined && storedTotal !== discountedSub + tax) {
    if (showVat) tax = storedTotal - discountedSub;
    else { discountedSub = storedTotal; discountAmt = subtotal - storedTotal; }
  }
  return { discountAmt, discountedSub, tax, total: discountedSub + tax };
}
