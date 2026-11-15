import { describe, expect, it } from 'vitest';
import { formatAddress, getSignUrl, isValidSuiAddress, truncateAddress } from './addressUtils';

const ADDRESS = '0x' + 'ab'.repeat(32);

describe('truncateAddress', () => {
  it('keeps the prefix and the last four characters', () => {
    expect(truncateAddress(ADDRESS)).toBe('0xabab...abab');
    expect(formatAddress(ADDRESS)).toBe(truncateAddress(ADDRESS));
  });

  it('returns an empty string for an empty address', () => {
    expect(truncateAddress('')).toBe('');
  });
});

describe('isValidSuiAddress', () => {
  it('accepts 0x-prefixed hex addresses', () => {
    expect(isValidSuiAddress(ADDRESS)).toBe(true);
  });

  it.each(['', 'ab'.repeat(32), '0x1234', '0x' + 'zz'.repeat(32)])('rejects %j', (value) => {
    expect(isValidSuiAddress(value)).toBe(false);
  });
});

describe('getSignUrl', () => {
  it('builds a path-style link on the current origin', () => {
    expect(getSignUrl('0xdoc')).toBe(`${window.location.origin}/sign/0xdoc`);
  });

  it('builds a query-style link when asked', () => {
    expect(getSignUrl('0xdoc', true)).toBe(`${window.location.origin}/sign?documentId=0xdoc`);
  });

  it('returns an empty string for a blank document id', () => {
    expect(getSignUrl('  ')).toBe('');
  });
});
