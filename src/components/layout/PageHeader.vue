<script setup lang="ts">
/**
 * 桌面 / 平板页面的统一页头：
 * 眉标 + 衬线标题 + 说明在左，状态摘要（分格统计条）在右，底部一条通栏分隔线；
 * 页面级操作（搜索、新建等）放进 #toolbar 插槽，渲染为页头下方的一行工具栏；
 * 传 backLabel 时在眉标左侧显示「‹ 返回」小标签（点击触发 back），用于设置页、导入任务等下钻页面。
 *
 * 页头自带左右内边距并通栏显示，页面根节点不要再给它套内边距。
 * 按页头自身宽度（而不是窗口宽度）在窄时改为上下排列。
 */
withDefaults(
  defineProps<{
    eyebrow?: string;
    title: string;
    description?: string;
    stats?: Array<{ label: string; value: string | number }>;
    /** 返回标签的文字；为空时不显示 */
    backLabel?: string;
  }>(),
  { eyebrow: '', description: '', stats: () => [], backLabel: '' },
);
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <div class="page-header">
    <header class="ph-head">
      <div class="ph-copy">
        <div v-if="eyebrow || backLabel" class="ph-eyebrow-row">
          <button
            v-if="backLabel"
            type="button"
            class="ph-back"
            :aria-label="backLabel"
            @click="emit('back')"
          >
            <i class="pi pi-chevron-left" aria-hidden="true" />
            <span>{{ backLabel }}</span>
          </button>
          <span v-if="eyebrow" class="ph-eyebrow">{{ eyebrow }}</span>
        </div>
        <h1 class="ph-title">{{ title }}</h1>
        <p v-if="description" class="ph-desc">{{ description }}</p>
      </div>
      <dl v-if="stats.length > 0" class="ph-stats">
        <div v-for="item in stats" :key="item.label" class="ph-stat">
          <dt class="ph-stat-label">{{ item.label }}</dt>
          <dd class="ph-stat-value">{{ item.value }}</dd>
        </div>
      </dl>
    </header>
    <div v-if="$slots.toolbar" class="ph-toolbar">
      <slot name="toolbar" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  flex-shrink: 0;
  container-type: inline-size;
}

.ph-head {
  padding: 22px 32px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
  display: flex;
  align-items: flex-end;
  gap: 24px;
}

.ph-copy {
  flex: 1;
  min-width: 0;
}

.ph-eyebrow-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

/* 返回：眉标左侧的小标签按钮 */
.ph-back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 22px;
  padding: 0 0.55rem 0 0.45rem;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--white-opacity-8);
  color: var(--accent-silver);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ph-back:hover {
  background: var(--white-opacity-4);
  border-color: var(--tsukuyomi-200-opacity-22); /* token: tsukuyomi-200 @ 22% */
  color: var(--moon-opacity-100);
}

.ph-back:active {
  background: var(--white-opacity-6);
}

.ph-back .pi {
  font-size: 0.68rem;
  line-height: 1;
}

.ph-eyebrow {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--tsukuyomi-300-opacity-75); /* token: tsukuyomi-300 @ 75% */
  text-transform: uppercase;
  font-weight: 500;
}

.ph-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  line-height: 1.1;
  margin: 0;
}

.ph-desc {
  font-size: 12px;
  color: var(--moon-50-opacity-55);
  margin: 6px 0 0;
}

/* 状态摘要：一条分格的小统计条 */
.ph-stats {
  display: flex;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 0;
  flex-shrink: 0;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
}

.ph-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 14px;
}

.ph-stat + .ph-stat {
  border-left: 1px solid var(--white-opacity-6);
}

.ph-stat-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--moon-50-opacity-50);
  white-space: nowrap;
}

.ph-stat-value {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* 工具栏：页面级操作，一行排开 */
.ph-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 32px;
  border-bottom: 1px solid var(--white-opacity-6);
}

/* 窄：标题与统计条上下排列 */
@container (max-width: 52rem) {
  .ph-head {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    padding: 18px 20px 14px;
  }

  .ph-title {
    font-size: 22px;
  }

  .ph-stats {
    align-self: flex-start;
  }

  .ph-toolbar {
    padding: 10px 20px;
  }
}
</style>
