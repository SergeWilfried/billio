// Supabase query + write functions for the accounting module.
// Each function is MOCK-aware: when VITE_MOCK_AUTH=true it returns the
// same mock constants used by the static prototype pages.

import { supabase } from '../supabase';
import {
  CLASSES, ACCOUNTS, JOURNALS, ENTRIES, OPENING,
  FIXED_ASSETS, SUPPLIER_BILLS,
} from '../accounting-data';
import type {
  AccountClass, Account, Journal, JournalEntry, FixedAsset, SupplierBill,
} from '../accounting-data';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

// ─── Type: DB row shapes ────────────────────────────────────────────────────

export interface FiscalPeriod {
  id: string;
  orgId: string;
  year: number;
  month: number;
  status: 'open' | 'closed';
  closedAt: string | null;
}

export interface AccountBalance {
  accountNum: string;
  totalDebit: number;
  totalCredit: number;
  net: number; // positive = debit balance
}

// ─── Row mappers ────────────────────────────────────────────────────────────

function toAccountClass(row: Record<string, unknown>): [number, AccountClass] {
  return [
    Number(row.id),
    { name: String(row.name), short: String(row.short), color: String(row.color) },
  ];
}

function toAccount(row: Record<string, unknown>): Account {
  return {
    num:    String(row.num),
    label:  String(row.label),
    nature: row.nature as 'D' | 'C',
  };
}

function toJournal(row: Record<string, unknown>): [string, Journal] {
  const code = String(row.code);
  // icon is not stored in DB — derive from code to match mock data
  const ICONS: Record<string, string> = {
    VE: 'receipt', AC: 'truck-delivery', BQ: 'building-bank',
    CA: 'cash', OD: 'arrows-exchange',
  };
  return [code, {
    code,
    name:  String(row.name),
    icon:  ICONS[code] ?? 'book',
    color: String(row.color),
  }];
}

function toJournalEntry(
  row: Record<string, unknown>,
  lines: Array<Record<string, unknown>>,
): JournalEntry {
  return {
    id:      String(row.id),
    journal: String(row.journal_code ?? row.code ?? ''),
    date:    String(row.date),
    piece:   String(row.piece ?? ''),
    label:   String(row.label),
    posted:  Boolean(row.posted),
    lines:   lines.map(l => ({
      acct: String(l.account_num),
      d:    Number(l.debit),
      c:    Number(l.credit),
    })),
  };
}

function toFixedAsset(row: Record<string, unknown>): FixedAsset {
  return {
    id:              String(row.id),
    name:            String(row.name),
    acct:            String(row.account_num),
    icon:            String(row.icon ?? 'building-warehouse'),
    acquisitionDate: String(row.acquisition_date),
    usefulLife:      Number(row.useful_life),
    method:          String(row.method),
    grossValue:      Number(row.gross_value),
  };
}

function toSupplierBill(row: Record<string, unknown>): SupplierBill {
  return {
    id:        String(row.id),
    supplier:  String(row.supplier),
    city:      String(row.city ?? ''),
    piece:     String(row.piece),
    date:      String(row.date),
    dueDate:   String(row.due_date),
    htAmount:  Number(row.ht_amount),
    tvaAmount: Number(row.tva_amount),
    status:    row.status as SupplierBill['status'],
    acctLines: (row.acct_lines as SupplierBill['acctLines']) ?? [],
  };
}

function toFiscalPeriod(row: Record<string, unknown>): FiscalPeriod {
  return {
    id:       String(row.id),
    orgId:    String(row.org_id),
    year:     Number(row.year),
    month:    Number(row.month),
    status:   row.status as FiscalPeriod['status'],
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

// ─── Reference data (account classes + accounts) ────────────────────────────

export async function fetchAccountClasses(): Promise<Record<number, AccountClass>> {
  if (MOCK) return CLASSES;
  const { data, error } = await supabase
    .from('account_classes')
    .select('*')
    .order('id');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(r => toAccountClass(r as Record<string, unknown>)));
}

export async function fetchAccounts(orgId: string): Promise<Account[]> {
  if (MOCK) return ACCOUNTS;
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order('num');
  if (error) throw error;
  return (data ?? []).map(r => toAccount(r as Record<string, unknown>));
}

// ─── Journals ───────────────────────────────────────────────────────────────

export async function fetchJournals(orgId: string): Promise<Record<string, Journal>> {
  if (MOCK) return JOURNALS;
  const { data, error } = await supabase
    .from('journals')
    .select('*')
    .eq('org_id', orgId)
    .order('code');
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).map(r => toJournal(r as Record<string, unknown>))
  );
}

// ─── Fiscal periods ──────────────────────────────────────────────────────────

export async function fetchFiscalPeriods(orgId: string, year: number): Promise<FiscalPeriod[]> {
  if (MOCK) {
    return Array.from({ length: 12 }, (_, i) => ({
      id: `mock-${year}-${i + 1}`,
      orgId,
      year,
      month: i + 1,
      status: (i < 5 ? 'closed' : 'open') as FiscalPeriod['status'],
      closedAt: null,
    }));
  }
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('org_id', orgId)
    .eq('year', year)
    .order('month');
  if (error) throw error;
  return (data ?? []).map(r => toFiscalPeriod(r as Record<string, unknown>));
}

export async function closeFiscalPeriod(periodId: string): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase
    .from('fiscal_periods')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', periodId);
  if (error) throw error;
}

// ─── Opening balances ────────────────────────────────────────────────────────

export async function fetchOpeningBalances(
  orgId: string,
  year: number,
): Promise<Record<string, number>> {
  if (MOCK) return OPENING;
  const { data, error } = await supabase
    .from('opening_balances')
    .select('account_num, signed_amount')
    .eq('org_id', orgId)
    .eq('exercise_year', year);
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).map(r => [String(r.account_num), Number(r.signed_amount)])
  );
}

// ─── Account balances (from v_account_balances view) ─────────────────────────

export async function fetchAccountBalances(orgId: string): Promise<AccountBalance[]> {
  if (MOCK) return []; // mock computes balances in-memory from ENTRIES
  const { data, error } = await supabase
    .from('v_account_balances')
    .select('account_num, total_debit, total_credit, net')
    .eq('org_id', orgId);
  if (error) throw error;
  return (data ?? []).map(r => ({
    accountNum:  String(r.account_num),
    totalDebit:  Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    net:         Number(r.net),
  }));
}

// ─── Journal entries ──────────────────────────────────────────────────────────

export async function fetchJournalEntries(
  orgId: string,
  opts: { periodId?: string; journalCode?: string; includeDraft?: boolean } = {},
): Promise<JournalEntry[]> {
  if (MOCK) {
    let entries = [...ENTRIES];
    if (!opts.includeDraft) entries = entries.filter(e => e.posted);
    if (opts.journalCode)   entries = entries.filter(e => e.journal === opts.journalCode);
    return entries;
  }

  let query = supabase
    .from('journal_entries')
    .select(`
      id, date, piece, label, posted,
      journals!inner ( code ),
      entry_lines ( account_num, debit, credit )
    `)
    .eq('org_id', orgId)
    .order('date', { ascending: false });

  if (opts.periodId)    query = query.eq('period_id', opts.periodId);
  if (opts.journalCode) query = query.eq('journals.code', opts.journalCode);
  if (!opts.includeDraft) query = query.eq('posted', true);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(row => {
    const r = row as Record<string, unknown>;
    const lines = (r.entry_lines as Array<Record<string, unknown>>) ?? [];
    const journal = (r.journals as Record<string, unknown>) ?? {};
    return toJournalEntry({ ...r, journal_code: journal.code }, lines);
  });
}

export async function createJournalEntry(
  orgId: string,
  payload: {
    journalId: string;
    periodId: string;
    date: string;
    piece: string;
    label: string;
    lines: Array<{ accountNum: string; debit: number; credit: number }>;
  },
): Promise<string> {
  if (MOCK) return `MOCK-${Date.now()}`;
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      org_id:     orgId,
      journal_id: payload.journalId,
      period_id:  payload.periodId,
      date:       payload.date,
      piece:      payload.piece,
      label:      payload.label,
      posted:     false,
    })
    .select('id')
    .single();
  if (error) throw error;

  const entryId = String((data as Record<string, unknown>).id);
  const { error: linesErr } = await supabase.from('entry_lines').insert(
    payload.lines.map(l => ({
      entry_id:    entryId,
      account_num: l.accountNum,
      debit:       l.debit,
      credit:      l.credit,
    }))
  );
  if (linesErr) throw linesErr;
  return entryId;
}

export async function postJournalEntry(entryId: string): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase
    .from('journal_entries')
    .update({ posted: true })
    .eq('id', entryId);
  if (error) throw error;
}

export async function deleteJournalEntry(entryId: string): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}

// ─── Fixed assets ─────────────────────────────────────────────────────────────

export async function fetchFixedAssets(orgId: string): Promise<FixedAsset[]> {
  if (MOCK) return FIXED_ASSETS;
  const { data, error } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('org_id', orgId)
    .order('id');
  if (error) throw error;
  return (data ?? []).map(r => toFixedAsset(r as Record<string, unknown>));
}

export async function createFixedAsset(
  orgId: string,
  asset: Omit<FixedAsset, 'id'> & { id: string },
): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase.from('fixed_assets').insert({
    id:                asset.id,
    org_id:            orgId,
    name:              asset.name,
    account_num:       asset.acct,
    amort_account_num: asset.acct.startsWith('2') ? '281' + asset.acct.slice(1) : '281',
    gross_value:       asset.grossValue,
    acquisition_date:  asset.acquisitionDate,
    useful_life:       asset.usefulLife,
    method:            asset.method,
    icon:              asset.icon,
  });
  if (error) throw error;
}

// ─── Supplier bills ───────────────────────────────────────────────────────────

export async function fetchSupplierBills(
  orgId: string,
  status?: SupplierBill['status'],
): Promise<SupplierBill[]> {
  if (MOCK) {
    return status ? SUPPLIER_BILLS.filter(b => b.status === status) : [...SUPPLIER_BILLS];
  }
  let query = supabase
    .from('supplier_bills')
    .select('*')
    .eq('org_id', orgId)
    .order('due_date');
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(r => toSupplierBill(r as Record<string, unknown>));
}

export async function markBillPaid(billId: string): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase
    .from('supplier_bills')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', billId);
  if (error) throw error;
}

export async function createSupplierBill(
  orgId: string,
  bill: Omit<SupplierBill, 'id' | 'acctLines'>,
): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase.from('supplier_bills').insert({
    org_id:     orgId,
    supplier:   bill.supplier,
    city:       bill.city,
    piece:      bill.piece,
    date:       bill.date,
    due_date:   bill.dueDate,
    ht_amount:  bill.htAmount,
    tva_amount: bill.tvaAmount,
    status:     'open',
  });
  if (error) throw error;
}

// ─── Accounts (custom / org-level) ────────────────────────────────────────────

export async function createAccount(
  orgId: string,
  account: Account,
): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase.from('accounts').insert({
    num:    account.num,
    label:  account.label,
    nature: account.nature,
    org_id: orgId,
  });
  if (error) throw error;
}
