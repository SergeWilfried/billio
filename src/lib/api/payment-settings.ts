import { supabase } from '@/lib/supabase';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

import type { OnlineMode, PaygateStatus, PispiCountry } from '@/lib/online-payments';

export interface PaymentSettings {
  // Invoice display methods
  methodMtnEnabled:    boolean;
  methodMtnPhone:      string;
  methodOrangeEnabled: boolean;
  methodOrangePhone:   string;
  methodWaveEnabled:   boolean;
  methodWavePhone:     string;
  methodBankEnabled:   boolean;
  methodBankIban:      string;
  methodCashEnabled:   boolean;
  // Online payment by PI-SPI (PRO-189): off, on the business's own alias, or through Paygate
  onlineMode:          OnlineMode;
  pispiAlias:          string;
  pispiCountry:        PispiCountry;
  /** Read only, internal: whether Billio confirms this business's payments through its gateway (set by Billio) */
  paygateStatus:       PaygateStatus;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  methodMtnEnabled:    false,
  methodMtnPhone:      '',
  methodOrangeEnabled: false,
  methodOrangePhone:   '',
  methodWaveEnabled:   false,
  methodWavePhone:     '',
  methodBankEnabled:   false,
  methodBankIban:      '',
  methodCashEnabled:   false,
  onlineMode:          'off',
  pispiAlias:          '',
  pispiCountry:        'BF',
  paygateStatus:       'none',
};

function dbToSettings(row: Record<string, unknown>): PaymentSettings {
  return {
    methodMtnEnabled:    Boolean(row.method_mtn_enabled),
    methodMtnPhone:      String(row.method_mtn_phone     ?? ''),
    methodOrangeEnabled: Boolean(row.method_orange_enabled),
    methodOrangePhone:   String(row.method_orange_phone  ?? ''),
    methodWaveEnabled:   Boolean(row.method_wave_enabled),
    methodWavePhone:     String(row.method_wave_phone    ?? ''),
    methodBankEnabled:   Boolean(row.method_bank_enabled),
    methodBankIban:      String(row.method_bank_iban     ?? ''),
    methodCashEnabled:   Boolean(row.method_cash_enabled),
    onlineMode:          (row.online_mode as OnlineMode) ?? 'off',
    pispiAlias:          String(row.pispi_alias ?? ''),
    pispiCountry:        (row.pispi_country as PispiCountry) ?? 'BF',
    paygateStatus:       (row.paygate_status as PaygateStatus) ?? 'none',
  };
}

export async function fetchPaymentSettings(orgId: string): Promise<PaymentSettings> {
  // Demo data so mock mode shows payment methods on invoices
  if (MOCK) return { ...DEFAULT_PAYMENT_SETTINGS, methodMtnEnabled: true, methodMtnPhone: '70 00 00 00', methodCashEnabled: true };
  const { data, error } = await supabase
    .from('org_payment_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_PAYMENT_SETTINGS };
  return dbToSettings(data as Record<string, unknown>);
}

export async function upsertPaymentSettings(
  orgId: string,
  patch: Partial<PaymentSettings>,
): Promise<void> {
  const db: Record<string, unknown> = { org_id: orgId, updated_at: new Date().toISOString() };

  // paygate_status and paygate_commission_pct are Billio's (the database refuses them from the app)
  const map: Array<[keyof PaymentSettings, string]> = [
    ['methodMtnEnabled',         'method_mtn_enabled'],
    ['methodMtnPhone',           'method_mtn_phone'],
    ['methodOrangeEnabled',      'method_orange_enabled'],
    ['methodOrangePhone',        'method_orange_phone'],
    ['methodWaveEnabled',        'method_wave_enabled'],
    ['methodWavePhone',          'method_wave_phone'],
    ['methodBankEnabled',        'method_bank_enabled'],
    ['methodBankIban',           'method_bank_iban'],
    ['methodCashEnabled',        'method_cash_enabled'],
    ['onlineMode',               'online_mode'],
    ['pispiAlias',               'pispi_alias'],
    ['pispiCountry',             'pispi_country'],
  ];

  for (const [jsKey, dbCol] of map) {
    if (patch[jsKey] !== undefined) db[dbCol] = patch[jsKey];
  }

  const { error } = await supabase
    .from('org_payment_settings')
    .upsert(db, { onConflict: 'org_id' });
  if (error) throw error;
}

