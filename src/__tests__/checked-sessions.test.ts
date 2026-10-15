import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckedSessions } from 'src/services/book-sync/checked-sessions';

type Session = Parameters<typeof CheckedSessions.put>[1];
const session = (name: string) => ({ name }) as unknown as Session;

afterEach(() => {
  CheckedSessions.take('b1');
  CheckedSessions.take('b2');
  vi.useRealTimers();
});

describe('已检查会话交接', () => {
  it('取一次后失效', () => {
    const s = session('s1');
    CheckedSessions.put('b1', s);
    expect(CheckedSessions.take('b1')).toBe(s);
    expect(CheckedSessions.take('b1')).toBeUndefined();
  });

  it('按书隔离，没放过的书取不到', () => {
    CheckedSessions.put('b1', session('s1'));
    expect(CheckedSessions.take('b2')).toBeUndefined();
    expect(CheckedSessions.take('b1')).toBeDefined();
  });

  it('同一本书再次放入时替换旧会话', () => {
    const next = session('s2');
    CheckedSessions.put('b1', session('s1'));
    CheckedSessions.put('b1', next);
    expect(CheckedSessions.take('b1')).toBe(next);
  });

  it('丢弃后取不到', () => {
    CheckedSessions.put('b1', session('s1'));
    CheckedSessions.drop('b1');
    expect(CheckedSessions.take('b1')).toBeUndefined();
  });

  it('超过有效期的会话不再交接', () => {
    vi.useFakeTimers();
    CheckedSessions.put('b1', session('s1'));
    vi.advanceTimersByTime(10 * 60_000);
    expect(CheckedSessions.take('b1')).toBeDefined();
    CheckedSessions.put('b1', session('s1'));
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(CheckedSessions.take('b1')).toBeUndefined();
  });
});
