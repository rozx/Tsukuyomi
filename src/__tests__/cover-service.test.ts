import { beforeEach, describe, expect, it } from 'bun:test';
import './setup';
import type { Novel } from '../models/novel';
import { CoverService } from '../services/cover-service';
import { useSettingsStore } from '../stores/settings';

const book: Novel = {
  id: 'cover-test',
  title: '封面测试',
  author: '作者',
  createdAt: new Date('2026-01-01'),
  lastEdited: new Date('2026-01-01'),
};

describe('CoverService.getCoverUrl', () => {
  beforeEach(() => {
    const settings = useSettingsStore();
    settings.settings.proxyEnabled = true;
    settings.settings.proxyUrl = 'https://cors.rozx.moe/?{url}';
  });

  it('Web 全局代理开启时，HTTP(S) 封面仍使用原始 URL', () => {
    for (const url of [
      'https://images.example.com/cover.jpg?width=200&height=300',
      'http://images.example.com/cover.jpg',
    ]) {
      expect(CoverService.getCoverUrl({ ...book, cover: { url } })).toBe(url);
    }
  });

  it('本地数据封面保持原样', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    expect(CoverService.getCoverUrl({ ...book, cover: { url } })).toBe(url);
  });

  it('没有封面或 URL 为空时，仍按界面语言生成默认封面', () => {
    for (const cover of [undefined, { url: '' }]) {
      const url = CoverService.getCoverUrl({ ...book, title: '', cover }, 'en-US');
      expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(atob(url.split(',')[1]!)).toContain('Untitled');
    }
  });
});
