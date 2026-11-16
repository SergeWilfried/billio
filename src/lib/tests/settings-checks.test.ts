import { describe, expect, it } from 'vitest';
import { cadastralProblem, checklistMissing, complianceChecklist, ifuProblem } from '@/lib/settings-checks';
import { sellerIssues, type SellerInfo } from '@/lib/invoice-compliance';
import { DEFAULT_CONFIG, normalizeConfig, paymentQrTarget } from '@/lib/invoice-template';
import type { PaymentSettings } from '@/lib/api/payment-settings';

const complete: SellerInfo = {
  name: 'Studio Wend', address: 'Av. Kwame Nkrumah', city: 'Ouagadougou', country: 'Burkina Faso',
  ifu: '00012345B', rccm: 'BF-OUA-2021-B-1234', taxRegime: 'RNI', divisionFiscale: 'DME Centre',
  cadastralRef: '01234567890',
};
const bank = { methodBankEnabled: true, methodBankIban: 'BF00 0000' } as PaymentSettings;
const state = (rows: ReturnType<typeof complianceChecklist>, key: string) => rows.find(r => r.key === key)?.state;

describe('ifuProblem', () => {
  it('takes 8 digits and a letter in Burkina Faso, with or without a space', () => {
    expect(ifuProblem('Burkina Faso', '00012345B')).toBeNull();
    expect(ifuProblem('Burkina Faso', '00012345 b')).toBeNull();
    expect(ifuProblem('Burkina Faso', '0001234B')).toMatch(/8 chiffres/);
    expect(ifuProblem('Burkina Faso', '000123456')).toMatch(/8 chiffres/);
  });

  it('leaves an empty IFU and other countries’ ids alone', () => {
    expect(ifuProblem('Burkina Faso', '  ')).toBeNull();
    expect(ifuProblem('Sénégal', '1234567 2G3')).toBeNull();
  });

  it('makes a malformed IFU a missing mention for the invoice checks too', () => {
    expect(sellerIssues({ ...complete, ifu: '12345' }, bank).map(i => i.key)).toEqual(['seller-ifu']);
  });
});

describe('cadastralProblem', () => {
  it('asks for 11 digits, spaces allowed', () => {
    expect(cadastralProblem('0412 007 0153')).toBeNull();
    expect(cadastralProblem('0412 07')).toMatch(/11 chiffres/);
    expect(cadastralProblem('')).toBeNull();
  });
});

describe('complianceChecklist', () => {
  it('has every line done for a complete organisation, and the automatic mentions', () => {
    const rows = complianceChecklist(complete, bank);
    expect(checklistMissing(rows)).toBe(0);
    expect(state(rows, 'numbering')).toBe('auto');
    expect(state(rows, 'mentions')).toBe('auto');
  });

  it('points each missing line to its field', () => {
    const rows = complianceChecklist({ ...complete, cadastralRef: '0412 07', ifu: '' }, { ...bank, methodBankEnabled: false });
    expect(rows.filter(r => r.state === 'missing').map(r => [r.key, r.fix?.tab, r.fix?.field])).toEqual([
      ['seller-ifu', 'business', 'set-ifu'],
      ['seller-cadastre', 'business', 'set-cadastre'],
      ['seller-bank', 'payments', undefined],
    ]);
  });

  it('leaves the bank details unknown when the payment settings couldn’t be read', () => {
    const rows = complianceChecklist(complete, null);
    expect(state(rows, 'seller-bank')).toBe('unknown');
    expect(checklistMissing(rows)).toBe(0);
  });

  it('only asks for the cadastral reference in Burkina Faso', () => {
    expect(state(complianceChecklist({ ...complete, country: 'Sénégal' }, bank), 'seller-cadastre')).toBeUndefined();
  });
});

describe('paymentQrTarget', () => {
  const url = 'https://billio.app/payer/abc';
  it('prints on an invoice with something left to pay and a payment link', () => {
    expect(paymentQrTarget({ config: DEFAULT_CONFIG, kind: 'facture', amountDue: 1000, paymentUrl: url })).toBe(url);
  });

  it('prints nothing without a payment link (until PRO-187), when switched off, paid, or on a quote or a credit note', () => {
    expect(paymentQrTarget({ config: DEFAULT_CONFIG, kind: 'facture', amountDue: 1000 })).toBeNull();
    expect(paymentQrTarget({ config: { showPaymentQr: false }, kind: 'facture', amountDue: 1000, paymentUrl: url })).toBeNull();
    expect(paymentQrTarget({ config: DEFAULT_CONFIG, kind: 'facture', amountDue: 0, paymentUrl: url })).toBeNull();
    expect(paymentQrTarget({ config: DEFAULT_CONFIG, kind: 'devis', amountDue: 1000, paymentUrl: url })).toBeNull();
    expect(paymentQrTarget({ config: DEFAULT_CONFIG, kind: 'avoir', amountDue: 1000, paymentUrl: url })).toBeNull();
    expect(paymentQrTarget({ config: DEFAULT_CONFIG, kind: 'facture', amountDue: 1000, paymentUrl: 'http://x.test' })).toBeNull();
  });

  it('is on for templates saved before the option existed', () => {
    expect(normalizeConfig({ layout: 'band' }).showPaymentQr).toBe(true);
    expect(normalizeConfig({ showPaymentQr: false }).showPaymentQr).toBe(false);
  });
});
