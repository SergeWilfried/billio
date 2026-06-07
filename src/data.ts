// Shared types and static data used across pages

import type {
  InvoiceStatus,
  Client,
  Invoice,
  Activity,
  LineItem,
} from './lib/schemas';

export type { InvoiceStatus as Status, Client, Invoice, ActivityKind, ActivityPart, Activity, LineItem } from './lib/schemas';

export type FilterKey = 'all' | InvoiceStatus;

export const CLIENTS: Record<string, Client> = {
  TK: { name: 'TechKonsult',     city: 'Ouagadougou',   av: 'av-a' },
  SB: { name: 'Sahel Banque',    city: 'Bobo-Dioulasso', av: 'av-b' },
  AM: { name: 'AgroMali SA',     city: 'Bamako',         av: 'av-c' },
  OT: { name: 'Orange Télécoms', city: 'Ouagadougou',    av: 'av-d' },
  BF: { name: 'BurkinaFarm',     city: 'Koudougou',      av: 'av-e' },
  MF: { name: 'MinFin Burkina',  city: 'Ouagadougou',    av: 'av-f' },
};

export const INITIAL_INVOICES: Invoice[] = [
  { id: 'INV-0041', subject: 'Refonte web — phase 2',        client: 'TK', issued: '1 juin',  due: 'Éch. 15 juin', amount: 780_000,   status: 'overdue' },
  { id: 'INV-0040', subject: 'Licence intégration ERP',      client: 'SB', issued: '28 mai',  due: 'Éch. 12 juin', amount: 1_200_000, status: 'paid'    },
  { id: 'INV-0039', subject: 'Audit sécurité T2',            client: 'AM', issued: '22 mai',  due: 'Éch. 5 juin',  amount: 450_000,   status: 'overdue' },
  { id: 'INV-0038', subject: 'Dév. appli mobile — sprint 4', client: 'OT', issued: '18 mai',  due: 'Éch. 2 juin',  amount: 960_000,   status: 'paid'    },
  { id: 'INV-0037', subject: 'Abonnement SaaS annuel',       client: 'BF', issued: '14 mai',  due: 'Éch. 28 mai',  amount: 320_000,   status: 'pending' },
  { id: 'INV-0036', subject: 'Conseil infra réseau',         client: 'MF', issued: '5 mai',   due: 'Éch. 19 mai',  amount: 625_000,   status: 'draft'   },
];

export const INITIAL_ACTIVITY: Activity[] = [
  { kind: 'paid',    parts: [{ text: 'Sahel Banque', bold: true }, { text: ' a payé #INV-0040' }],                             time: "Aujourd'hui, 9h14" },
  { kind: 'sent',    parts: [{ text: 'Relance envoyée à ' }, { text: 'TechKonsult', bold: true }, { text: ' pour #INV-0041' }], time: 'Hier, 15h40' },
  { kind: 'viewed',  parts: [{ text: 'BurkinaFarm', bold: true }, { text: ' a consulté #INV-0037' }],                          time: '4 juin, 11h02' },
  { kind: 'paid',    parts: [{ text: 'Orange Télécoms', bold: true }, { text: ' a payé #INV-0038' }],                          time: '2 juin, 14h15' },
  { kind: 'overdue', parts: [{ text: 'AgroMali SA', bold: true }, { text: ' — facture en retard' }],                          time: '5 juin, automatique' },
];

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Payée', overdue: 'En retard', pending: 'En attente', draft: 'Brouillon',
};

export const fmt = (n: number) => n.toLocaleString('fr-FR');

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}

export function nextId(invoices: Invoice[]): string {
  const nums = invoices.map(i => parseInt(i.id.split('-')[1], 10));
  return 'INV-' + String(Math.max(...nums) + 1).padStart(4, '0');
}

export function newLineItem(desc = '', qty = 1, price = 0): LineItem {
  return { id: crypto.randomUUID(), desc, qty, price };
}
