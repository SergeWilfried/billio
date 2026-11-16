// The fiscal id's shape (IFU in Burkina Faso), checked in Paramètres and
// before an invoice is issued.

const isBurkina = (country: string | undefined) => {
  const c = (country ?? '').trim().toLowerCase();
  return c === '' || c === 'burkina faso' || c === 'bf';
};

/**
 * Why the IFU can't be right, or null. In Burkina Faso it is 8 digits and a
 * letter (« 00012345B », a space before the letter is allowed); elsewhere the
 * fiscal id has other shapes, so only Burkina's is checked. Empty is left to
 * the checklist (missing, not malformed).
 */
export function ifuProblem(country: string | undefined, ifu: string): string | null {
  const v = ifu.trim();
  if (!v || !isBurkina(country)) return null;
  return /^\d{8}\s?[A-Za-z]$/.test(v) ? null : 'L’IFU compte 8 chiffres suivis d’une lettre, par exemple 00012345B.';
}
