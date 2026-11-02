import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('writes a BOM, semicolons and CRLF line endings', () => {
    expect(toCsv(['Date', 'Montant'], [['2026-11-02', 150000]])).toBe('﻿Date;Montant\r\n2026-11-02;150000\r\n');
  });

  it('quotes cells containing separators, quotes or newlines', () => {
    expect(toCsv(['A'], [['Sahel; "Banque"'], ['ligne 1\nligne 2'], [null]]))
      .toBe('﻿A\r\n"Sahel; ""Banque"""\r\n"ligne 1\nligne 2"\r\n\r\n');
  });
});
