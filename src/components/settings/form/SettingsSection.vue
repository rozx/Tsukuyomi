<script setup lang="ts">
/**
 * 设置分区卡片：标题 + 说明（可用 #description 插槽放链接）+ 内容 + 底部操作区（#actions）。
 * 所有设置标签页共用，保证三端的标题层级、字号、间距与按钮排布一致。
 */
import { useId } from 'vue';

interface Props {
  title?: string | undefined;
  description?: string | undefined;
  /** danger：删除等不可撤销操作的分区，边框改用红色调 */
  tone?: 'default' | 'danger';
}

withDefaults(defineProps<Props>(), { tone: 'default' });

const titleId = useId();
</script>

<template>
  <section
    class="settings-section"
    :class="{ 'settings-section--danger': tone === 'danger' }"
    :aria-labelledby="title ? titleId : undefined"
  >
    <header
      v-if="title || description || $slots.description || $slots['header-actions']"
      class="settings-section-header"
    >
      <div class="settings-section-heading">
        <h3 v-if="title" :id="titleId" class="settings-section-title">{{ title }}</h3>
        <p v-if="description || $slots.description" class="settings-section-description">
          <slot name="description">{{ description }}</slot>
        </p>
      </div>
      <div v-if="$slots['header-actions']" class="settings-section-header-actions">
        <slot name="header-actions" />
      </div>
    </header>

    <div v-if="$slots.default" class="settings-section-body">
      <slot />
    </div>

    <footer v-if="$slots.actions" class="settings-section-actions">
      <slot name="actions" />
    </footer>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--white-opacity-8);
  border-radius: 14px;
  background: var(--white-opacity-2-5);
}

.settings-section--danger {
  border-color: var(--red-500-opacity-28);
  background: var(--red-500-opacity-8);
}

.settings-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.settings-section-heading {
  min-width: 0;
}

.settings-section-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--moon-50-opacity-92);
}

.settings-section-description {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--moon-50-opacity-62);
}

.settings-section-description :deep(a) {
  color: var(--tsukuyomi-200);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.settings-section-description :deep(code) {
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  background: var(--white-opacity-6);
  font-size: 0.75rem;
}

.settings-section-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.settings-section-body {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  min-width: 0;
}

/* 内容全部被 v-if 隐藏时只剩注释节点，:empty 会命中，避免留下多余间距 */
.settings-section-body:empty {
  display: none;
}

.settings-section-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--white-opacity-6);
}

@media (max-width: 640px) {
  .settings-section {
    padding: 1rem;
  }

  .settings-section-actions :slotted(.p-button) {
    flex: 1 1 auto;
  }
}
</style>
