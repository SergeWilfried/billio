import { describe, expect, it } from 'vitest';
import { buildPayloadString, isValidPispiQrPayload } from '@pi-spi/qrcode';
import { aliasProblem, aliasQrFields, commissionOn, effectiveMode, paymentPageUrl } from '@/lib/online-payments';

describe('online payments', () => {
  it('only a SHID alias can go in a QR code', () => {
    expect(aliasProblem('3497a720-ab11-4973-9619-534e04f263a1')).toBeNull();
    expect(aliasProblem('')).toMatch(/Saisissez/);
    expect(aliasProblem('+22670000000')).toMatch(/pas un numéro/);
  });

  it('commission: 1 % in whole francs, the rest is paid out', () => {
    expect(commissionOn(4000, 1)).toEqual({ commission: 40, net: 3960 });
    expect(commissionOn(1250, 1)).toEqual({ commission: 13, net: 1237 }); // 12.5 rounds up, as the database does
    expect(commissionOn(5000, 0)).toEqual({ commission: 0, net: 5000 });
  });

  it('off unless turned on; then the gateway once Billio approved it, else the alias', () => {
    const alias = '3497a720-ab11-4973-9619-534e04f263a1';
    expect(effectiveMode({ onlineMode: 'alias', paygateStatus: 'approved', pispiAlias: alias })).toBe('paygate');
    expect(effectiveMode({ onlineMode: 'alias', paygateStatus: 'pending', pispiAlias: alias })).toBe('alias');
    expect(effectiveMode({ onlineMode: 'alias', paygateStatus: 'none', pispiAlias: '' })).toBe('off');
    expect(effectiveMode({ onlineMode: 'off', paygateStatus: 'approved', pispiAlias: alias })).toBe('off');
  });

  it('the QR code for the business\'s own alias is a valid PI-SPI payload carrying the invoice number', () => {
    const payload = buildPayloadString(aliasQrFields('3497A720-AB11-4973-9619-534E04F263A1', 'BF', 'FA-2026-001', 4000));
    expect(isValidPispiQrPayload(payload).valid).toBe(true);
    expect(payload).toContain('3497a720-ab11-4973-9619-534e04f263a1');
    expect(payload).toContain('FA-2026-001');
    expect(paymentPageUrl('https://billio.app/', 'abc')).toBe('https://billio.app/payer/abc');
  });
});
