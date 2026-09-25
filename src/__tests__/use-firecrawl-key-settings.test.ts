import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';
import { useFirecrawlKeySettings } from 'src/composables/settings/useFirecrawlKeySettings';
import { useSettingsStore } from 'src/stores/settings';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const OK = {
  kind: 'ok' as const,
  remainingCredits: 480,
  planCredits: 500,
  billingPeriodEnd: '2026-10-01T00:00:00Z',
};

beforeEach(async () => {
  await useSettingsStore().loadSettings();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFirecrawlKeySettings', () => {
  it('初始化不发请求，输入框回填已保存的 Key', async () => {
    await useSettingsStore().setFirecrawlApiKey('fc-saved');
    const credit = vi.spyOn(FirecrawlClient, 'getCreditUsage');
    const s = useFirecrawlKeySettings();
    expect(s.keyInput.value).toBe('fc-saved');
    expect(s.hasKey.value).toBe(true);
    expect(credit).not.toHaveBeenCalled();
  });

  it('设置尚未加载完就创建时，加载后回填已保存的 Key，且不会误判为待保存（避免误删）', async () => {
    await useSettingsStore().setFirecrawlApiKey('fc-saved');
    setActivePinia(createPinia());
    const store = useSettingsStore();
    const s = useFirecrawlKeySettings();
    expect(s.keyInput.value).toBe('');

    await store.loadSettings();
    await nextTick();

    expect(s.keyInput.value).toBe('fc-saved');
    expect(s.isDirty.value).toBe(false);
  });

  it('保存有效 Key：先校验再保存，并显示额度', async () => {
    const credit = vi.spyOn(FirecrawlClient, 'getCreditUsage').mockResolvedValue(OK);
    const s = useFirecrawlKeySettings();
    s.keyInput.value = '  fc-abc  ';
    await s.save();
    expect(credit).toHaveBeenCalledWith('fc-abc');
    expect(useSettingsStore().firecrawlApiKey).toBe('fc-abc');
    expect(s.credits.value).toEqual({
      remainingCredits: 480,
      planCredits: 500,
      billingPeriodEnd: '2026-10-01T00:00:00Z',
    });
    expect(s.error.value).toBeNull();
  });

  it('401：不保存并提示无效的 API Key', async () => {
    await useSettingsStore().setFirecrawlApiKey('fc-old');
    vi.spyOn(FirecrawlClient, 'getCreditUsage').mockResolvedValue({ kind: 'invalid-key' });
    const s = useFirecrawlKeySettings();
    s.keyInput.value = 'fc-wrong';
    await s.save();
    expect(useSettingsStore().firecrawlApiKey).toBe('fc-old');
    expect(s.error.value).toBe('无效的 API Key');
  });

  it('网络错误：不保存并提示无法验证', async () => {
    vi.spyOn(FirecrawlClient, 'getCreditUsage').mockRejectedValue(new Error('Network Error'));
    const s = useFirecrawlKeySettings();
    s.keyInput.value = 'fc-abc';
    await s.save();
    expect(useSettingsStore().firecrawlApiKey).toBeUndefined();
    expect(s.error.value).toContain('无法验证');
  });

  it('清空后保存：移除 Key 且不发请求', async () => {
    await useSettingsStore().setFirecrawlApiKey('fc-old');
    const credit = vi.spyOn(FirecrawlClient, 'getCreditUsage');
    const s = useFirecrawlKeySettings();
    s.keyInput.value = '';
    await s.save();
    expect(useSettingsStore().firecrawlApiKey).toBeUndefined();
    expect(credit).not.toHaveBeenCalled();
    expect(s.credits.value).toBeNull();
  });

  it('检查额度：用已保存的 Key 发一次请求', async () => {
    await useSettingsStore().setFirecrawlApiKey('fc-saved');
    const credit = vi.spyOn(FirecrawlClient, 'getCreditUsage').mockResolvedValue(OK);
    const s = useFirecrawlKeySettings();
    await s.refreshCredits();
    expect(credit).toHaveBeenCalledTimes(1);
    expect(credit).toHaveBeenCalledWith('fc-saved');
    expect(s.credits.value?.remainingCredits).toBe(480);
  });

  it('无 Key 时检查额度不可用', async () => {
    const credit = vi.spyOn(FirecrawlClient, 'getCreditUsage');
    const s = useFirecrawlKeySettings();
    expect(s.canCheckCredits.value).toBe(false);
    await s.refreshCredits();
    expect(credit).not.toHaveBeenCalled();
  });

  it('总开关读写 firecrawlFallbackEnabled', async () => {
    const s = useFirecrawlKeySettings();
    expect(s.fallbackEnabled.value).toBe(true);
    await s.setFallbackEnabled(false);
    expect(useSettingsStore().firecrawlFallbackEnabled).toBe(false);
    expect(s.fallbackEnabled.value).toBe(false);
  });
});
