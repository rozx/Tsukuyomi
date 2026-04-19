import { describe, expect, it } from 'bun:test';
import { isNewlyAdded, isTimeDifferent, toMillis } from 'src/utils/time-utils';

describe('toMillis', () => {
  it('converts Date to its timestamp', () => {
    const d = new Date('2025-06-01T10:00:00.000Z');
    expect(toMillis(d)).toBe(d.getTime());
  });

  it('passes through finite numbers', () => {
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toMillis(0)).toBe(0);
  });

  it('parses ISO strings', () => {
    const iso = '2025-06-01T10:00:00.000Z';
    expect(toMillis(iso)).toBe(new Date(iso).getTime());
  });

  it('returns 0 for null / undefined', () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(undefined)).toBe(0);
  });

  it('returns 0 for invalid values instead of NaN', () => {
    expect(toMillis('not-a-date')).toBe(0);
    expect(toMillis(new Date('invalid'))).toBe(0);
    expect(toMillis(Number.NaN)).toBe(0);
    expect(toMillis(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('does not care if the input is Date vs. ISO string representing the same moment', () => {
    const d = new Date('2025-06-01T10:00:00.000Z');
    expect(toMillis(d)).toBe(toMillis(d.toISOString()));
  });
});

describe('isTimeDifferent', () => {
  it('returns false when both within threshold', () => {
    const a = new Date('2025-06-01T10:00:00.000Z');
    const b = new Date('2025-06-01T10:00:00.500Z');
    expect(isTimeDifferent(a, b, 1000)).toBe(false);
  });

  it('returns true when beyond threshold', () => {
    const a = new Date('2025-06-01T10:00:00.000Z');
    const b = new Date('2025-06-01T10:00:02.000Z');
    expect(isTimeDifferent(a, b, 1000)).toBe(true);
  });

  it('tolerates mixed Date / string / number inputs', () => {
    const iso = '2025-06-01T10:00:00.000Z';
    const d = new Date(iso);
    expect(isTimeDifferent(iso, d, 1)).toBe(false);
    expect(isTimeDifferent(iso, d.getTime(), 1)).toBe(false);
  });
});

describe('isNewlyAdded', () => {
  it('treats first-ever sync as newly added regardless of time', () => {
    expect(isNewlyAdded(new Date('2000-01-01'), 0)).toBe(true);
    expect(isNewlyAdded('not-a-date', 0)).toBe(true);
  });

  it('returns true when edited after last sync', () => {
    const lastSync = new Date('2025-01-01T00:00:00Z').getTime();
    const edited = new Date('2025-01-02T00:00:00Z');
    expect(isNewlyAdded(edited, lastSync)).toBe(true);
  });

  it('returns false when edited before last sync', () => {
    const lastSync = new Date('2025-01-02T00:00:00Z').getTime();
    const edited = new Date('2025-01-01T00:00:00Z');
    expect(isNewlyAdded(edited, lastSync)).toBe(false);
  });

  it('accepts ISO string inputs', () => {
    const lastSync = new Date('2025-01-01T00:00:00Z').getTime();
    expect(isNewlyAdded('2025-01-02T00:00:00Z', lastSync)).toBe(true);
  });
});
