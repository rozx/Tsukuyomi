<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { AppLocale } from 'src/models/locale';
import { getNameTranslation } from 'src/services/localization/selection';
import type { CharacterSetting } from 'src/models/novel';
const { t } = useI18n();

// 角色提示框内容：多个匹配角色（按出现次数排序）的列表渲染。
// 从 ParagraphPopovers 拆出以降低其模板认知复杂度。
const props = defineProps<{
  characters: CharacterSetting[];
  targetLanguage?: AppLocale;
}>();
const translationText = (owner: CharacterSetting) =>
  getNameTranslation(owner, props.targetLanguage ?? 'zh-CN')?.translation ?? '';
</script>

<template>
  <div>
    <!-- 角色列表已按出现次数排序（出现次数多的在前） -->
    <div v-if="characters.length > 1" class="popover-multiple-characters-hint">
      <span class="hint-text">{{
        t('panelUi.matchingCharacters', { count: characters.length })
      }}</span>
    </div>

    <template v-for="(char, index) in characters" :key="char.id">
      <div v-if="index > 0" class="popover-character-divider" />
      <div class="popover-character-item">
        <div class="popover-header">
          <div class="popover-character-name-row">
            <span class="popover-character-name">{{ char.name }}</span>
            <span v-if="char.sex" class="popover-character-sex">
              {{
                char.sex === 'male'
                  ? t('panelUi.maleShort')
                  : char.sex === 'female'
                    ? t('panelUi.femaleShort')
                    : t('panelUi.other')
              }}
            </span>
          </div>
          <span class="popover-translation">{{ translationText(char) }}</span>
        </div>
        <div v-if="char.description" class="popover-description">{{ char.description }}</div>
        <div v-if="char.aliases && char.aliases.length > 0" class="popover-aliases">
          <span class="popover-aliases-label">{{ t('panelUi.aliasesLabel') }}</span>
          <span class="popover-aliases-list">
            {{ char.aliases.map((a) => a.name).join(t('panelUi.separator')) }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.popover-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.popover-character-name-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.popover-character-name {
  font-weight: 600;
  color: var(--moon-opacity-95);
  font-size: 0.9375rem;
}

.popover-character-sex {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--white-opacity-5);
}

.popover-translation {
  color: var(--primary-opacity-90);
  font-size: 0.875rem;
}

.popover-description {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  line-height: 1.5;
  margin-top: 0.375rem;
}

.popover-character-divider {
  height: 1px;
  background: var(--white-opacity-10);
  margin: 0.5rem 0;
}

/* 角色项容器。从 ParagraphCard.vue 迁移而来 —— 该元素渲染于本组件，父级 scoped 无法命中。 */
.popover-character-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popover-multiple-characters-hint .hint-text {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.popover-aliases {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.popover-aliases-label {
  color: var(--moon-opacity-50);
}

.popover-aliases-list {
  color: var(--moon-opacity-80);
}
</style>
