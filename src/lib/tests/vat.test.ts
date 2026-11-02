import { describe, it, expect } from 'vitest';
import { chargesVat, splitTtc, vatOn } from '@/lib/vat';

describe('vat', () => {
  it('only RNI organisations charge VAT', () => {
    expect(chargesVat('RNI')).toBe(true);
    expect(chargesVat('RSI')).toBe(false);
    expect(chargesVat(undefined)).toBe(false);
  });

  it('computes VAT on a pre-tax amount', () => {
    expect(vatOn(100_000, true)).toBe(18_000);
    expect(vatOn(100_000, false)).toBe(0);
  });

  it('splits a VAT-inclusive amount so the parts add back up', () => {
    expect(splitTtc(118_000, true)).toEqual({ ht: 100_000, tva: 18_000 });
    const { ht, tva } = splitTtc(99_999, true);
    expect(ht + tva).toBe(99_999);
    expect(splitTtc(50_000, false)).toEqual({ ht: 50_000, tva: 0 });
  });
});
