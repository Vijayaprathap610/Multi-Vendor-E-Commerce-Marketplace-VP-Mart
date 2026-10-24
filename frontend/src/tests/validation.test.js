import { describe, expect, it } from 'vitest';
import {
  passwordStrength,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
} from '../utils/validation.js';
import { formatINR, roleLabel } from '../utils/format.js';

describe('validation', () => {
  it('validates emails', () => {
    expect(validateEmail('a@b.co')).toBe('');
    expect(validateEmail('  a@b.co ')).toBe('');
    expect(validateEmail('nope')).not.toBe('');
    expect(validateEmail('a@b')).not.toBe('');
  });
  it('enforces the same password rules as the backend', () => {
    expect(validatePassword('short1')).toMatch(/10/);
    expect(validatePassword('onlyletterslong')).toMatch(/letters and numbers/);
    expect(validatePassword('1234567890123')).toMatch(/letters and numbers/);
    expect(validatePassword('Sup3rSecret99')).toBe('');
  });
  it('treats phone as optional but strict when present', () => {
    expect(validatePhone('')).toBe('');
    expect(validatePhone('9876543210')).toBe('');
    expect(validatePhone('+919876543210')).toBe('');
    expect(validatePhone('12345')).not.toBe('');
    expect(validatePhone('98765abc10')).not.toBe('');
  });
  it('requires a name', () => {
    expect(validateName(' a ')).not.toBe('');
    expect(validateName('Asha')).toBe('');
  });
  it('scores password strength from 0 to 4', () => {
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('Sup3rSecret99!!')).toBe(4);
  });
});

describe('format', () => {
  it('formats rupees with Indian digit grouping', () => {
    expect(formatINR(1300)).toBe('₹1,300.00');
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
    expect(formatINR(undefined)).toBe('₹0.00');
  });
  it('labels roles', () => {
    expect(roleLabel('delivery_agent')).toBe('Delivery Agent');
  });
});
