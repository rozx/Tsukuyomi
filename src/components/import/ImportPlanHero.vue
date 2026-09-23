<script setup lang="ts">
/** 方案页头部：目标、整体状态与说明，以及生成与确认导入的操作。 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import type { ImportPlan } from 'src/models/import';
import type { ImportPlanStatus } from 'src/composables/import-page/import-plan-status';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { formatTime } from './import-labels';

const props = defineProps<{ plan: ImportPlan | null; status: ImportPlanStatus }>();
const emit = defineEmits<{ preview: []; apply: []; openBook: [] }>();
const store = useImportWorkspaceStore();

const ICONS: Record<ImportPlanStatus['kind'], string> = {
  none: 'pi-list-check',
  applied: 'pi-check-circle',
  stale: 'pi-history',
  conflicts: 'pi-exclamation-triangle',
  unchanged: 'pi-equals',
  ready: 'pi-verified',
};

const title = computed(() => {
  if (!props.plan) return '还没有导入方案';
  const name = props.plan.book.title || '（未命名）';
  return props.plan.targetKind === 'new' ? `新建《${name}》` : `更新《${name}》`;
});
const meta = computed(() => {
  const plan = props.plan;
  if (!plan) return '方案只计算实际变化，生成后不会写入书库。';
  const target = plan.targetKind === 'new' ? '书库中新建小说' : '更新书库中已有的小说';
  return `${target} · 生成于 ${formatTime(plan.createdAt)} · 草稿版本 ${plan.draftRevision}`;
});
const showApply = computed(() => Boolean(props.plan) && props.status.kind !== 'applied');
</script>

<template>
  <div class="iph" :class="`iph--${status.kind}`">
    <div class="iph-head">
      <div class="iph-icon" aria-hidden="true">
        <i class="pi" :class="ICONS[status.kind]" />
      </div>
      <div class="iph-text">
        <div class="iph-eyebrow">
          <span>导入方案</span>
          <Tag :value="status.label" :severity="status.severity" />
        </div>
        <h2 class="iph-title">{{ title }}</h2>
        <p class="iph-meta">{{ meta }}</p>
      </div>
    </div>

    <p class="iph-message">{{ status.message }}</p>

    <div class="iph-actions">
      <Button
        v-if="status.kind === 'applied'"
        icon="pi pi-book"
        label="打开小说"
        size="small"
        outlined
        @click="emit('openBook')"
      />
      <Button
        :icon="plan ? 'pi pi-refresh' : 'pi pi-list-check'"
        :label="plan ? '重新生成' : '生成导入方案'"
        size="small"
        :outlined="Boolean(plan)"
        :disabled="!status.canPreview"
        :loading="store.pendingAction === 'preview'"
        @click="emit('preview')"
      />
      <Button
        v-if="showApply"
        icon="pi pi-check"
        label="确认导入"
        size="small"
        severity="success"
        :disabled="!status.canApply || store.pendingAction === 'apply'"
        :loading="store.pendingAction === 'apply'"
        @click="emit('apply')"
      />
    </div>
  </div>
</template>

<style scoped>
.iph {
  --iph-accent: rgb(148, 163, 184);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--iph-accent) 14%, transparent),
      transparent 70%
    ),
    rgba(255, 255, 255, 0.03);
  border: 1px solid color-mix(in srgb, var(--iph-accent) 30%, transparent);
}

.iph--ready,
.iph--applied {
  --iph-accent: rgb(74, 222, 128);
}

.iph--stale,
.iph--conflicts {
  --iph-accent: rgb(251, 191, 36);
}

.iph--none {
  --iph-accent: rgb(129, 140, 248);
}

.iph-head {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  min-width: 0;
}

.iph-icon {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--iph-accent);
  background: color-mix(in srgb, var(--iph-accent) 16%, transparent);
}

.iph-icon i {
  font-size: 1.1rem;
}

.iph-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.iph-eyebrow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: rgba(226, 232, 240, 0.55);
}

.iph-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.iph-meta {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.5);
}

.iph-message {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.78);
}

.iph-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
