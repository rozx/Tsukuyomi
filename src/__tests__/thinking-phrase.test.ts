import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import zhCN from 'src/i18n/zh-CN';
import zhTW from 'src/i18n/zh-TW';

const { useThinkingPhrase } = await import('src/composables/chat/useThinkingPhrase');

const FIXED_POOL = ['phrase A', 'phrase B', 'phrase C', 'phrase D', 'phrase E'];

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    tm: () => FIXED_POOL,
    rt: (item: string) => item,
  }),
}));

describe('useThinkingPhrase', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('pickPhrase 返回池中元素并调用 Math.random', () => {
    randomSpy.mockReturnValue(0); // 锁定第一个
    const { pickPhrase } = useThinkingPhrase();
    expect(pickPhrase()).toBe('phrase A');
    expect(randomSpy).toHaveBeenCalled();
  });

  it('多次抽取后 currentPhrase 反映最后一次抽取结果（思考结束保持锁定）', () => {
    const { pickPhrase, currentPhrase } = useThinkingPhrase();
    randomSpy.mockReturnValue(0.4); // floor(0.4 * 5) = 2 → 'phrase C'
    pickPhrase();
    expect(currentPhrase.value).toBe('phrase C');
  });

  it('5 次抽取覆盖到的索引均落在池长度范围内', () => {
    const { pickPhrase } = useThinkingPhrase();
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      randomSpy.mockReturnValue(i / 5);
      seen.push(pickPhrase());
    }
    for (const phrase of seen) {
      expect(FIXED_POOL).toContain(phrase);
    }
  });

  it('未调用 pickPhrase 时 currentPhrase 兜底为池首条', () => {
    const { currentPhrase } = useThinkingPhrase();
    expect(currentPhrase.value).toBe(FIXED_POOL[0]);
  });
});

describe('i18n 文案池长度（zh-CN / zh-TW 各 ≥ 5）', () => {
  it('zh-CN chat.thinkingPhrases 至少有 5 条', () => {
    const phrases = (zhCN as { chat?: { thinkingPhrases?: string[] } }).chat?.thinkingPhrases;
    expect(Array.isArray(phrases)).toBe(true);
    expect(phrases?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('zh-TW chat.thinkingPhrases 至少有 5 条', () => {
    const phrases = (zhTW as { chat?: { thinkingPhrases?: string[] } }).chat?.thinkingPhrases;
    expect(Array.isArray(phrases)).toBe(true);
    expect(phrases?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('zh-CN 文案含「妾身」字样（人格化已生效）', () => {
    const phrases = (zhCN as { chat?: { thinkingPhrases?: string[] } }).chat?.thinkingPhrases ?? [];
    const joined = phrases.join('|');
    expect(joined).toContain('妾身');
  });
});
