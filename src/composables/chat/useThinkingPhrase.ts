import { computed, ref, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';

const FALLBACK_POOL: string[] = ['正在思考……'];

/**
 * 思考态文案池：从 i18n 取池后随机抽一条作为助手「正在思考」的指示文字。
 *
 * - `pickPhrase()` 立即抽一条并把 `currentPhrase` 锁定，思考结束保持不变（避免视觉跳动）。
 * - `currentPhrase` 是只读 ref，未抽过时返回池中第一条作为兜底。
 */
export function useThinkingPhrase(): {
  pickPhrase: () => string;
  currentPhrase: ComputedRef<string>;
} {
  const i18n = useI18n();
  const locked = ref<string | null>(null);

  const pool = computed<string[]>(() => {
    const raw = i18n.tm('chat.thinkingPhrases');
    if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_POOL;
    return raw.map((item) => i18n.rt(item as never));
  });

  const pickPhrase = (): string => {
    const list = pool.value;
    const idx = Math.floor(Math.random() * list.length);
    const phrase = list[idx] ?? FALLBACK_POOL[0]!;
    locked.value = phrase;
    return phrase;
  };

  const currentPhrase = computed<string>(() => locked.value ?? pool.value[0] ?? FALLBACK_POOL[0]!);

  return { pickPhrase, currentPhrase };
}
