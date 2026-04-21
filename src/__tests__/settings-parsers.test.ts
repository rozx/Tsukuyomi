import './setup';
import { describe, expect, it } from 'bun:test';
import {
  validateSettingsShape,
  parseAiModels,
  parseNovels,
  parseCoverHistory,
  parseMemories,
  parseSyncConfigs,
  parseAppSettings,
} from 'src/services/settings/settings-parsers';
import type { Settings } from 'src/models/settings';
import { SyncType } from 'src/models/sync';

describe('validateSettingsShape', () => {
  it('返回 null 表示结构合法（最小合法形态）', () => {
    expect(validateSettingsShape({ aiModels: [] } as unknown as Settings)).toBeNull();
  });

  it('接受可选字段全部为合法数组的形态', () => {
    const settings = {
      aiModels: [],
      novels: [],
      coverHistory: [],
      memories: [],
      sync: [],
    } as unknown as Settings;
    expect(validateSettingsShape(settings)).toBeNull();
  });

  it('settings 为 null 时返回错误消息', () => {
    expect(validateSettingsShape(null as unknown as Settings)).toBe('无效的设置数据格式');
  });

  it('settings 不是对象时返回错误消息', () => {
    expect(validateSettingsShape('abc' as unknown as Settings)).toBe('无效的设置数据格式');
  });

  it('缺少 aiModels 数组时返回错误消息', () => {
    expect(validateSettingsShape({} as unknown as Settings)).toBe(
      '设置数据中缺少有效的 aiModels 数组',
    );
  });

  it('aiModels 不是数组时返回错误消息', () => {
    expect(validateSettingsShape({ aiModels: 'x' } as unknown as Settings)).toBe(
      '设置数据中缺少有效的 aiModels 数组',
    );
  });

  it('novels 不是数组时返回错误消息', () => {
    expect(
      validateSettingsShape({ aiModels: [], novels: 'x' } as unknown as Settings),
    ).toBe('设置数据中的 novels 字段格式无效');
  });

  it('coverHistory 不是数组时返回错误消息', () => {
    expect(
      validateSettingsShape({ aiModels: [], coverHistory: {} } as unknown as Settings),
    ).toBe('设置数据中的 coverHistory 字段格式无效');
  });

  it('memories 不是数组时返回错误消息', () => {
    expect(
      validateSettingsShape({ aiModels: [], memories: 1 } as unknown as Settings),
    ).toBe('设置数据中的 memories 字段格式无效');
  });

  it('sync 不是数组时返回错误消息', () => {
    expect(
      validateSettingsShape({ aiModels: [], sync: {} } as unknown as Settings),
    ).toBe('设置数据中的 sync 字段格式无效');
  });
});

describe('parseAiModels', () => {
  it('过滤掉缺少必填字段的模型', () => {
    const raw = [
      { id: 'm1', name: 'A', provider: 'openai', model: 'gpt', apiKey: 'k' },
      { id: 'm2', name: 'B' },
      null,
      'string',
      { id: 'm3', name: 'C', provider: 'openai', model: 'gpt' }, // 缺 apiKey
    ];
    const result = parseAiModels(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('保留原字段并把 lastEdited 转成 Date', () => {
    const lastEdited = '2024-01-01T00:00:00.000Z';
    const raw = [
      { id: 'm1', name: 'A', provider: 'openai', model: 'gpt', apiKey: 'k', lastEdited },
    ];
    const result = parseAiModels(raw);
    expect(result[0]?.lastEdited).toBeInstanceOf(Date);
    expect(result[0]?.lastEdited.toISOString()).toBe(lastEdited);
  });

  it('缺省 lastEdited 时填入当前时间', () => {
    const before = Date.now();
    const raw = [{ id: 'm1', name: 'A', provider: 'openai', model: 'gpt', apiKey: 'k' }];
    const result = parseAiModels(raw);
    const after = Date.now();
    expect(result[0]?.lastEdited).toBeInstanceOf(Date);
    const ts = result[0]!.lastEdited.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('空数组返回空数组', () => {
    expect(parseAiModels([])).toEqual([]);
  });
});

describe('parseNovels', () => {
  it('undefined / 非数组输入返回空数组', () => {
    expect(parseNovels(undefined)).toEqual([]);
    expect(parseNovels('x' as unknown as unknown[])).toEqual([]);
  });

  it('过滤掉缺字段的项并把日期字符串转为 Date', () => {
    const raw = [
      {
        id: 'n1',
        title: 'T1',
        createdAt: '2024-01-01',
        lastEdited: '2024-01-02',
      },
      { id: 'n2', title: 'T2' }, // 缺日期
      null,
    ];
    const result = parseNovels(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('n1');
    expect(result[0]?.createdAt).toBeInstanceOf(Date);
    expect(result[0]?.lastEdited).toBeInstanceOf(Date);
  });
});

describe('parseCoverHistory', () => {
  it('undefined / 非数组输入返回空数组', () => {
    expect(parseCoverHistory(undefined)).toEqual([]);
    expect(parseCoverHistory(123 as unknown as unknown[])).toEqual([]);
  });

  it('保留合法封面并把 addedAt 转成 Date', () => {
    const raw = [
      { id: 'c1', url: 'http://x/1.png', addedAt: '2024-01-01' },
      { id: 'c2' }, // 缺字段
    ];
    const result = parseCoverHistory(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c1');
    expect(result[0]?.addedAt).toBeInstanceOf(Date);
  });
});

describe('parseMemories', () => {
  it('undefined / 非数组输入返回空数组', () => {
    expect(parseMemories(undefined)).toEqual([]);
    expect(parseMemories({} as unknown as unknown[])).toEqual([]);
  });

  it('summary 允许为空字符串（typeof string 即可）', () => {
    const raw = [
      {
        id: 'm1',
        bookId: 'b1',
        content: 'content',
        summary: '',
        createdAt: 1_700_000_000_000,
        lastAccessedAt: 1_700_000_000_000,
      },
    ];
    const result = parseMemories(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe('');
  });

  it('将 Date / 字符串形式的时间戳统一转成毫秒数字', () => {
    const dateObj = new Date('2024-06-01T00:00:00.000Z');
    const raw = [
      {
        id: 'm1',
        bookId: 'b1',
        content: 'c',
        summary: 's',
        createdAt: dateObj,
        lastAccessedAt: '2024-06-02T00:00:00.000Z',
      },
      {
        id: 'm2',
        bookId: 'b1',
        content: 'c',
        summary: 's',
        createdAt: 1_700_000_000_000,
        lastAccessedAt: 1_700_000_000_001,
      },
    ];
    const result = parseMemories(raw);
    expect(result).toHaveLength(2);
    expect(typeof result[0]?.createdAt).toBe('number');
    expect(result[0]?.createdAt).toBe(dateObj.getTime());
    expect(typeof result[0]?.lastAccessedAt).toBe('number');
    expect(result[1]?.createdAt).toBe(1_700_000_000_000);
  });

  it('过滤缺字段 / summary 非字符串的项', () => {
    const raw = [
      {
        id: 'm1',
        bookId: 'b1',
        content: 'c',
        summary: 123, // 非字符串
        createdAt: 1,
        lastAccessedAt: 1,
      },
      {
        id: 'm2',
        bookId: 'b1',
        content: 'c',
        // 缺 summary
        createdAt: 1,
        lastAccessedAt: 1,
      },
      null,
    ];
    expect(parseMemories(raw)).toEqual([]);
  });
});

describe('parseSyncConfigs', () => {
  const validConfig = {
    enabled: true,
    lastSyncTime: 0,
    syncInterval: 60,
    syncType: SyncType.Gist,
    syncParams: {},
    secret: 'secret',
    apiEndpoint: 'https://api.github.com',
  };

  it('undefined / 非数组输入返回空数组', () => {
    expect(parseSyncConfigs(undefined)).toEqual([]);
    expect(parseSyncConfigs('x' as unknown as unknown[])).toEqual([]);
  });

  it('过滤 null / 非对象 / 字段类型非法的项', () => {
    const raw = [
      null,
      'x',
      { ...validConfig, enabled: 'yes' }, // enabled 非 boolean
      { ...validConfig, syncType: 'not-a-type' }, // syncType 非法
      { ...validConfig, apiEndpoint: 123 }, // apiEndpoint 非字符串
    ];
    expect(parseSyncConfigs(raw)).toEqual([]);
  });

  it('保留合法项并对 syncParams 缺失时默认为空对象', () => {
    const raw = [
      { ...validConfig, syncParams: null as unknown as Record<string, string> },
      { ...validConfig, secret: 'second' },
    ];
    const result = parseSyncConfigs(raw);
    // 第一项会被 isValidSyncConfig 过滤（typeof null === 'object' 但校验通过），检查兜底逻辑
    // 具体：typeof null === 'object' 成立 -> isValidSyncConfig 认为 syncParams 合法
    // 然后构造时 syncParams || {} 生效
    expect(result).toHaveLength(2);
    expect(result[0]?.syncParams).toEqual({});
    expect(result[1]?.secret).toBe('second');
  });

  it('带 lastSyncedModelIds 数组时透传', () => {
    const raw = [{ ...validConfig, lastSyncedModelIds: ['a', 'b'] }];
    const result = parseSyncConfigs(raw);
    expect(result[0]?.lastSyncedModelIds).toEqual(['a', 'b']);
  });

  it('lastSyncedModelIds 非数组时不写入该字段', () => {
    const raw = [{ ...validConfig, lastSyncedModelIds: 'x' as unknown as string[] }];
    const result = parseSyncConfigs(raw);
    expect(result[0]?.lastSyncedModelIds).toBeUndefined();
  });
});

describe('parseAppSettings', () => {
  it('非对象输入返回 undefined', () => {
    expect(parseAppSettings(null)).toBeUndefined();
    expect(parseAppSettings('x')).toBeUndefined();
    expect(parseAppSettings(undefined)).toBeUndefined();
  });

  it('空对象时返回含默认字段（lastEdited、scraperConcurrencyLimit=3）', () => {
    const result = parseAppSettings({});
    expect(result).toBeTruthy();
    expect(result?.lastEdited).toBeInstanceOf(Date);
    expect(result?.scraperConcurrencyLimit).toBe(3);
    expect(result?.taskDefaultModels).toBeUndefined();
  });

  it('scraperConcurrencyLimit 在合法范围内保留原值', () => {
    const result = parseAppSettings({ scraperConcurrencyLimit: 5 });
    expect(result?.scraperConcurrencyLimit).toBe(5);
  });

  it('scraperConcurrencyLimit 超范围 / 非数字时回退到默认值', () => {
    expect(parseAppSettings({ scraperConcurrencyLimit: 0 })?.scraperConcurrencyLimit).toBe(3);
    expect(parseAppSettings({ scraperConcurrencyLimit: 11 })?.scraperConcurrencyLimit).toBe(3);
    expect(
      parseAppSettings({ scraperConcurrencyLimit: 'x' })?.scraperConcurrencyLimit,
    ).toBe(3);
  });

  it('scraperConcurrencyLimit 边界值 1 / 10 均合法', () => {
    expect(parseAppSettings({ scraperConcurrencyLimit: 1 })?.scraperConcurrencyLimit).toBe(1);
    expect(parseAppSettings({ scraperConcurrencyLimit: 10 })?.scraperConcurrencyLimit).toBe(10);
  });

  it('lastEdited 有值时转成 Date，没有则用当前时间', () => {
    const iso = '2024-01-01T00:00:00.000Z';
    const result = parseAppSettings({ lastEdited: iso });
    expect(result?.lastEdited.toISOString()).toBe(iso);
  });

  it('taskDefaultModels 只接受字符串或 null 值，其他忽略', () => {
    const result = parseAppSettings({
      taskDefaultModels: {
        translation: 'model-1',
        proofreading: null,
        termsTranslation: '', // 空字符串不接受
        assistant: 123, // 非字符串非 null 忽略
        bogus: 'x', // 未知 key 忽略
      },
    });
    expect(result?.taskDefaultModels).toEqual({
      translation: 'model-1',
      proofreading: null,
    });
  });

  it('taskDefaultModels 全部非法时不写入该字段', () => {
    const result = parseAppSettings({
      taskDefaultModels: { translation: '', proofreading: 999 },
    });
    expect(result?.taskDefaultModels).toBeUndefined();
  });

  it('taskDefaultModels 非对象时不写入', () => {
    const result = parseAppSettings({ taskDefaultModels: 'x' });
    expect(result?.taskDefaultModels).toBeUndefined();
  });

  it('透传已定义的可选字段', () => {
    const result = parseAppSettings({
      lastOpenedSettingsTab: 2,
      proxyEnabled: true,
      proxyUrl: 'http://p',
      proxyAutoSwitch: false,
      proxyAutoAddMapping: true,
      proxySiteMapping: { 'a.com': { enabled: true, proxies: [] } },
      proxyList: [{ id: '1', name: 'p', url: 'u' }],
      quickStartDismissed: true,
    });
    expect(result?.lastOpenedSettingsTab).toBe(2);
    expect(result?.proxyEnabled).toBe(true);
    expect(result?.proxyUrl).toBe('http://p');
    expect(result?.proxyAutoSwitch).toBe(false);
    expect(result?.proxyAutoAddMapping).toBe(true);
    expect(result?.proxySiteMapping).toEqual({ 'a.com': { enabled: true, proxies: [] } });
    expect(result?.proxyList).toHaveLength(1);
    expect(result?.quickStartDismissed).toBe(true);
  });

  it('quickStartDismissed 非 boolean 时不写入', () => {
    const result = parseAppSettings({ quickStartDismissed: 'yes' });
    expect(result?.quickStartDismissed).toBeUndefined();
  });
});
