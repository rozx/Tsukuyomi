import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedRemoteChapter,
  remoteChapterCacheSize,
  setCachedRemoteChapter,
} from 'src/services/book-sync/remote-chapter-cache';

afterEach(() => {
  vi.useRealTimers();
});

describe('remote-chapter-cache', () => {
  it('30 分钟内命中，过期后不再返回', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    setCachedRemoteChapter('a', ['正文']);
    vi.setSystemTime(29 * 60_000);
    expect(getCachedRemoteChapter('a')).toEqual(['正文']);
    vi.setSystemTime(31 * 60_000);
    expect(getCachedRemoteChapter('a')).toBeUndefined();
  });

  it('写入时清理未再次读取的过期条目，不会随检查过的章节无限增长', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    for (let i = 0; i < 50; i++) setCachedRemoteChapter(`old-${i}`, ['x']);
    vi.setSystemTime(31 * 60_000);
    setCachedRemoteChapter('fresh', ['y']);
    expect(remoteChapterCacheSize()).toBe(1);
  });

  it('超过容量上限时淘汰最早写入的条目', () => {
    for (let i = 0; i < 501; i++) setCachedRemoteChapter(`k-${i}`, ['x']);
    expect(remoteChapterCacheSize()).toBe(500);
    expect(getCachedRemoteChapter('k-0')).toBeUndefined();
    expect(getCachedRemoteChapter('k-500')).toEqual(['x']);
  });
});
