// Per-feature hooks for the accounting module.
// Each hook calls the API layer, wires org_id from AppContext, and returns
// the same data shapes the page components already consume — so page diffs
// are limited to swapping imports + adding a loading guard.

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  fetchAccountClasses,
  fetchAccounts,
  fetchJournals,
  fetchFiscalPeriods,
  fetchOpeningBalances,
  fetchAccountBalances,
  fetchJournalEntries,
  fetchFixedAssets,
  fetchSupplierBills,
  postJournalEntry,
  deleteJournalEntry,
  createJournalEntry,
  createFixedAsset as apiCreateFixedAsset,
  markBillPaid as apiBillPaid,
  createSupplierBill as apiCreateBill,
  createAccount as apiCreateAccount,
  closeFiscalPeriod as apiClosePeriod,
} from './api/accounting';
import type { FiscalPeriod, AccountBalance } from './api/accounting';
import {
  movementsOf, closingSigned, ledgerOf, openingOf,
  ACCOUNTS, CLASSES, JOURNALS, ENTRIES, OPENING,
  FIXED_ASSETS, SUPPLIER_BILLS,
} from './accounting-data';
import type {
  AccountClass, Account, Journal, JournalEntry, FixedAsset, SupplierBill,
} from './accounting-data';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';
const EXERCISE_YEAR = 2026;

// ─── Shared helper ───────────────────────────────────────────────────────────

function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then(d  => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, reload };
}

// ─── Chart of Accounts ───────────────────────────────────────────────────────

export interface ChartData {
  classes:  Record<number, AccountClass>;
  accounts: Account[];
  journals: Record<string, Journal>;
  opening:  Record<string, number>;
  balances: AccountBalance[]; // empty in MOCK — computed in-memory instead
}

export function useChartOfAccounts() {
  const { orgId } = useApp();
  const result = useAsyncData<ChartData>(async () => {
    const [classes, accounts, journals, opening, balances] = await Promise.all([
      fetchAccountClasses(),
      fetchAccounts(orgId),
      fetchJournals(orgId),
      fetchOpeningBalances(orgId, EXERCISE_YEAR),
      fetchAccountBalances(orgId),
    ]);
    return { classes, accounts, journals, opening, balances };
  }, [orgId]);

  const addAccount = useCallback(async (account: Account) => {
    await apiCreateAccount(orgId, account);
    result.reload();
  }, [orgId, result]);

  return { ...result, addAccount };
}

// ─── Journals ────────────────────────────────────────────────────────────────

export interface JournalsData {
  journals: Record<string, Journal>;
  accounts: Account[];
  entries:  JournalEntry[];
}

export function useJournalsData(includeDraft = true) {
  const { orgId } = useApp();
  const load = useCallback(async (): Promise<JournalsData> => {
    const [journals, accounts, entries] = await Promise.all([
      fetchJournals(orgId),
      fetchAccounts(orgId),
      fetchJournalEntries(orgId, { includeDraft }),
    ]);
    return { journals, accounts, entries };
  }, [orgId, includeDraft]);

  const result = useAsyncData(load, [orgId, includeDraft]);

  const postEntry = useCallback(async (entryId: string) => {
    await postJournalEntry(entryId);
    result.reload();
  }, [result]);

  const removeEntry = useCallback(async (entryId: string) => {
    await deleteJournalEntry(entryId);
    result.reload();
  }, [result]);

  const saveEntry = useCallback(async (payload: Parameters<typeof createJournalEntry>[1]) => {
    await createJournalEntry(orgId, payload);
    result.reload();
  }, [orgId, result]);

  return { ...result, postEntry, removeEntry, saveEntry };
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

export interface TrialBalanceData {
  classes:  Record<number, AccountClass>;
  accounts: Account[];
  journals: Record<string, Journal>;
  opening:  Record<string, number>;
  balances: AccountBalance[];
  // In MOCK mode, movementsOf / closingSigned / ledgerOf are still the mock functions.
  // In real mode the page derives the same numbers from opening + balances.
}

export function useTrialBalance() {
  const { orgId } = useApp();
  return useAsyncData<TrialBalanceData>(async () => {
    const [classes, accounts, journals, opening, balances] = await Promise.all([
      fetchAccountClasses(),
      fetchAccounts(orgId),
      fetchJournals(orgId),
      fetchOpeningBalances(orgId, EXERCISE_YEAR),
      fetchAccountBalances(orgId),
    ]);
    return { classes, accounts, journals, opening, balances };
  }, [orgId]);
}

// ─── Financial Statements ────────────────────────────────────────────────────

export interface FinancialStatementsData {
  opening:  Record<string, number>;
  balances: AccountBalance[];
}

export function useFinancialStatements() {
  const { orgId } = useApp();
  return useAsyncData<FinancialStatementsData>(async () => {
    const [opening, balances] = await Promise.all([
      fetchOpeningBalances(orgId, EXERCISE_YEAR),
      fetchAccountBalances(orgId),
    ]);
    return { opening, balances };
  }, [orgId]);
}

// ─── Fixed Assets ─────────────────────────────────────────────────────────────

export function useFixedAssets() {
  const { orgId } = useApp();
  const result = useAsyncData<FixedAsset[]>(
    () => fetchFixedAssets(orgId),
    [orgId],
  );

  const createAsset = useCallback(async (asset: Omit<FixedAsset, 'id'> & { id: string }) => {
    await apiCreateFixedAsset(orgId, asset);
    result.reload();
  }, [orgId, result]);

  return { ...result, createAsset };
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export function useSupplierBills() {
  const { orgId } = useApp();
  const result = useAsyncData<SupplierBill[]>(
    () => fetchSupplierBills(orgId),
    [orgId],
  );

  const markPaid = useCallback(async (billId: string) => {
    await apiBillPaid(billId);
    result.reload();
  }, [result]);

  const createBill = useCallback(async (bill: Omit<SupplierBill, 'id' | 'acctLines'>) => {
    await apiCreateBill(orgId, bill);
    result.reload();
  }, [orgId, result]);

  return { ...result, markPaid, createBill };
}

// ─── Tax ──────────────────────────────────────────────────────────────────────

export interface TaxData {
  journals: Record<string, Journal>;
  entries:  JournalEntry[]; // posted only
}

export function useTaxData() {
  const { orgId } = useApp();
  return useAsyncData<TaxData>(async () => {
    const [journals, entries] = await Promise.all([
      fetchJournals(orgId),
      fetchJournalEntries(orgId, { includeDraft: false }),
    ]);
    return { journals, entries };
  }, [orgId]);
}

// ─── Period Closing ───────────────────────────────────────────────────────────

export interface PeriodClosingData {
  periods:  FiscalPeriod[];
  entries:  JournalEntry[]; // all (need draft count)
  opening:  Record<string, number>;
  balances: AccountBalance[];
}

export function usePeriodClosing() {
  const { orgId } = useApp();
  const result = useAsyncData<PeriodClosingData>(async () => {
    const [periods, entries, opening, balances] = await Promise.all([
      fetchFiscalPeriods(orgId, EXERCISE_YEAR),
      fetchJournalEntries(orgId, { includeDraft: true }),
      fetchOpeningBalances(orgId, EXERCISE_YEAR),
      fetchAccountBalances(orgId),
    ]);
    return { periods, entries, opening, balances };
  }, [orgId]);

  const closePeriod = useCallback(async (periodId: string) => {
    await apiClosePeriod(periodId);
    result.reload();
  }, [result]);

  return { ...result, closePeriod };
}

// ─── Re-export computed helpers so pages import from one place ────────────────
// In MOCK mode these work directly on ENTRIES / OPENING (in-memory).
// In real mode pages will receive pre-computed balances from the DB view
// and should prefer those over calling these functions.

export {
  movementsOf, closingSigned, ledgerOf, openingOf,
  ACCOUNTS, CLASSES, JOURNALS, ENTRIES, OPENING,
  FIXED_ASSETS, SUPPLIER_BILLS,
};
export type { AccountClass, Account, Journal, JournalEntry, FixedAsset, SupplierBill };
export type { FiscalPeriod, AccountBalance };
