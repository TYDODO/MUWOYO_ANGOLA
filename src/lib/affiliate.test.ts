import { describe, expect, it } from 'vitest';
import { formatKwanza } from './affiliate';

describe('affiliate formatting', () => {
  it('formats Kwanza values with thousand separator and currency', () => {
    expect(formatKwanza(5000)).toBe('5.000 Kz');
    expect(formatKwanza(125000)).toBe('125.000 Kz');
  });
});
