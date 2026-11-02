// VAT used on invoices, quotes, credit notes and supplier bills. Billio
// applies the standard OHADA/Burkina Faso rate of 18 %, and only for
// organisations under the RNI tax regime (others can't charge VAT).

export const VAT_RATE = 0.18;
export const VAT_LABEL = 'TVA (18 %)';

/** Whether the organisation may charge VAT. */
export function chargesVat(taxRegime: string | undefined): boolean {
  return taxRegime === 'RNI';
}

/** VAT due on a pre-tax amount (0 when VAT doesn't apply). */
export function vatOn(ht: number, applies: boolean): number {
  return applies ? Math.round(ht * VAT_RATE) : 0;
}

/** Splits a VAT-inclusive amount into pre-tax and VAT parts. */
export function splitTtc(ttc: number, applies: boolean): { ht: number; tva: number } {
  if (!applies) return { ht: ttc, tva: 0 };
  const ht = Math.round(ttc / (1 + VAT_RATE));
  return { ht, tva: ttc - ht };
}
