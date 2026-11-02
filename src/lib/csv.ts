// CSV export for statements (Relevé). Semicolon-separated with a UTF-8 BOM so
// French Excel opens it with accents and columns intact.

export type CsvCell = string | number | null | undefined;

function cell(v: CsvCell): string {
  const s = v == null ? '' : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function csvBlob(header: string[], rows: CsvCell[][]): Blob {
  return new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
}
