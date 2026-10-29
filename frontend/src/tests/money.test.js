import { describe, expect, it } from 'vitest';
import {
  discountPercent,
  formatPaise,
  paiseToRupeesString,
  rupeesToPaise,
} from '../utils/money.js';

describe('money (integer paise, no floating point)', () => {
  it('parses rupee input exactly', () => {
    expect(rupeesToPaise('1299')).toBe(129900);
    expect(rupeesToPaise('1,299.50')).toBe(129950);
    expect(rupeesToPaise('₹ 0.1')).toBe(10);
    expect(rupeesToPaise('19.99')).toBe(1999);
    expect(rupeesToPaise('0.07')).toBe(7);
  });
  it('avoids the classic float errors', () => {
    expect(rupeesToPaise('1.15')).toBe(115); // 1.15 * 100 === 114.99999999999999 in floats
    expect(rupeesToPaise('8.2')).toBe(820);
    expect(rupeesToPaise('0.29')).toBe(29);
  });
  it('rejects anything that is not a valid amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1..2', '12e3', null, undefined])
      expect(rupeesToPaise(bad)).toBeNull();
  });
  it('formats with Indian digit grouping', () => {
    expect(formatPaise(129900)).toBe('₹1,299');
    expect(formatPaise(129950)).toBe('₹1,299.50');
    expect(formatPaise(129905)).toBe('₹1,299.05');
    expect(formatPaise(129950, { fixed: true })).toBe('₹1,299.50');
    expect(formatPaise(123456700, { fixed: true })).toBe('₹12,34,567.00');
    expect(formatPaise(undefined)).toBe('₹0');
  });
  it('round-trips between paise and a form string', () => {
    expect(paiseToRupeesString(129900)).toBe('1299');
    expect(paiseToRupeesString(129950)).toBe('1299.50');
    expect(paiseToRupeesString(null)).toBe('');
    expect(rupeesToPaise(paiseToRupeesString(4999))).toBe(4999);
  });
  it('computes whole-number discounts like the server', () => {
    expect(discountPercent(50000, 80000)).toBe(37);
    expect(discountPercent(50000, 50000)).toBe(0);
    expect(discountPercent(60000, 50000)).toBe(0);
  });
});
