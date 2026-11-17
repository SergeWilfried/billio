// Online payment by PI-SPI (PRO-189, PRO-187): the rules the settings, the invoice and the public payment page share.
//
// A business turns online payment on and gives its PI-SPI alias. Its clients then pay on that alias (matched from
// the statement), or, once Billio approves it, through Billio's internal gateway, Paygate (recorded on the invoice by
// itself, for a commission). Paygate is never named to users; its approval and commission are set by Billio only.

export type OnlineMode = 'off' | 'alias' | 'paygate';
export type PaygateStatus = 'none' | 'pending' | 'approved' | 'suspended';
/** UEMOA countries, ISO 3166 alpha-2, as the PI-SPI QR code names them */
export type PispiCountry = 'BF' | 'CI' | 'SN' | 'ML' | 'NE' | 'TG' | 'BJ' | 'GW';

export const PISPI_COUNTRIES: { code: PispiCountry; label: string }[] = [
  { code: 'BF', label: 'Burkina Faso' }, { code: 'CI', label: 'Côte d’Ivoire' }, { code: 'SN', label: 'Sénégal' },
  { code: 'ML', label: 'Mali' }, { code: 'NE', label: 'Niger' }, { code: 'TG', label: 'Togo' },
  { code: 'BJ', label: 'Bénin' }, { code: 'GW', label: 'Guinée-Bissau' },
];

/** A PI-SPI alias that can go in a QR code: the account's SHID, a UUID (phone-number aliases cannot). */
const SHID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function aliasProblem(alias: string): string | null {
  const a = alias.trim();
  if (!a) return 'Saisissez votre alias PI-SPI.';
  return SHID.test(a) ? null : 'L’alias d’un QR code PI-SPI est l’identifiant de votre compte (36 caractères, ex. 3497a720-ab11-4973-9619-534e04f263a1), pas un numéro de téléphone.';
}

/** Paygate's commission on a payment, in whole F CFA (rounded half up), and what is paid out. */
export function commissionOn(amount: number, pct: number): { commission: number; net: number } {
  const commission = Math.round((amount * pct) / 100);
  return { commission, net: amount - commission };
}

/**
 * How the business is paid online now, as the payment page sees it (the database decides the same way): off unless
 * the business turned it on; then confirmed by Billio's gateway once Billio approved it, else on its own alias.
 */
export function effectiveMode(s: { onlineMode: OnlineMode; paygateStatus: PaygateStatus; pispiAlias: string }): OnlineMode {
  if (s.onlineMode === 'off') return 'off';
  if (s.paygateStatus === 'approved') return 'paygate';
  return aliasProblem(s.pispiAlias) ? 'off' : 'alias';
}

/** The public payment page of an invoice. */
export const paymentPageUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/payer/${token}`;

/**
 * The QR fields for paying on the business's own alias: the invoice number is the reference the payment carries,
 * so it can be matched from the statement. PI-SPI references are at most 25 characters.
 */
export function aliasQrFields(alias: string, country: string, invoiceNumber: string, amount: number) {
  return { alias: alias.trim().toLowerCase(), countryCode: country, qrType: 'DYNAMIC' as const, referenceLabel: invoiceNumber.slice(0, 25), amount };
}
