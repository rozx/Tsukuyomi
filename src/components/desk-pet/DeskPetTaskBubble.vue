<script setup lang="ts">
/**
 * 月詠桌宠气泡里的任务进度：标题行（任务名、段落进度、收起 / 展开）+ 思考 / 工具 / 输出条目；
 * 展开时底部有「打开任务中心」与多任务切换。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DeskPetFollowed } from 'src/composables/desk-pet/useDeskPet';
import type { DeskPetEntry } from 'src/composables/desk-pet/desk-pet-entries';

const props = defineProps<{
  followed: DeskPetFollowed;
  entries: DeskPetEntry[];
  expanded: boolean;
  candidateCount: number;
  followIndex: number;
}>();
const emit = defineEmits<{
  toggle: [];
  openTaskCenter: [event: MouseEvent];
  previous: [];
  next: [];
}>();

const { t } = useI18n();

const ENTRY_TONE: Record<DeskPetEntry['kind'], string> = {
  thinking: 'dpt-chip--thinking',
  tool: 'dpt-chip--tool',
  output: 'dpt-chip--output',
};

const icon = computed(() =>
  props.followed.kind === 'assistant' ? 'pi pi-comments' : 'pi pi-language',
);
const toggleLabel = computed(() =>
  props.expanded ? t('deskPetUi.collapse') : t('deskPetUi.expand'),
);
</script>

<template>
  <div class="dpt" :class="{ 'dpt--expanded': expanded }">
    <div class="dpt-head">
      <i :class="icon" class="dpt-head-icon" aria-hidden="true" />
      <span class="dpt-title">{{ followed.title }}</span>
      <span v-if="followed.meta" class="dpt-meta">{{ followed.meta }}</span>
      <button
        type="button"
        class="dpt-icon-btn dp-toggle"
        :aria-label="toggleLabel"
        :title="toggleLabel"
        :aria-expanded="expanded"
        @click="emit('toggle')"
      >
        <i class="pi" :class="expanded ? 'pi-chevron-down' : 'pi-chevron-up'" aria-hidden="true" />
      </button>
    </div>

    <div v-if="entries.length === 0" class="dpt-row dpt-row--muted">
      {{ followed.remote ? t('deskPetUi.remote') : t('deskPetUi.preparing') }}
    </div>
    <div v-for="(entry, index) in entries" :key="index" class="dpt-row">
      <span class="dpt-chip" :class="ENTRY_TONE[entry.kind]">
        {{ t(`deskPetUi.kinds.${entry.kind}`) }}
      </span>
      <div class="dpt-row-body">
        <span :class="{ 'dpt-thinking': entry.kind === 'thinking' }">{{ entry.text }}</span>
        <span v-if="entry.tool" class="dpt-tool">
          {{ entry.tool }}
          <template v-if="entry.toolStatus">
            · {{ t(`deskPetUi.toolStatus.${entry.toolStatus}`) }}
          </template>
        </span>
      </div>
    </div>

    <div v-if="expanded" class="dpt-footer">
      <button type="button" class="dp-link" @click="emit('openTaskCenter', $event)">
        {{ t('deskPetUi.openTaskCenter') }}
      </button>
      <span class="dpt-spacer" />
      <template v-if="candidateCount > 1">
        <button
          type="button"
          class="dpt-icon-btn"
          :aria-label="t('deskPetUi.previous')"
          :title="t('deskPetUi.previous')"
          @click="emit('previous')"
        >
          <i class="pi pi-angle-left" aria-hidden="true" />
        </button>
        <span class="dpt-meta">{{ followIndex + 1 }} / {{ candidateCount }}</span>
        <button
          type="button"
          class="dpt-icon-btn"
          :aria-label="t('deskPetUi.next')"
          :title="t('deskPetUi.next')"
          @click="emit('next')"
        >
          <i class="pi pi-angle-right" aria-hidden="true" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dpt-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dpt-head-icon {
  font-size: 12px;
  color: #a3b7cf;
}

.dpt-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.dpt-meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--moon-opacity-50);
  font-variant-numeric: tabular-nums;
}

.dpt-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--btn-text-color);
  cursor: pointer;
}

.dpt-icon-btn:hover {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}

.dpt-icon-btn i {
  font-size: 11px;
}

.dpt-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 0;
}

.dpt--expanded .dpt-row + .dpt-row {
  border-top: 1px solid var(--white-opacity-6);
}

.dpt-row--muted {
  color: var(--moon-opacity-50);
}

.dpt-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  word-break: break-word;
}

.dpt-thinking {
  color: var(--moon-opacity-60);
}

.dpt-tool {
  font-size: 11px;
  color: var(--moon-opacity-50);
}

.dpt-chip {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 5px;
  font-size: 11px;
  line-height: 18px;
}

.dpt-chip--thinking {
  background: var(--white-opacity-8);
  color: var(--moon-opacity-70);
}

.dpt-chip--tool {
  background: rgba(163, 183, 207, 0.16);
  color: #bac9db;
}

.dpt-chip--output {
  background: rgba(127, 194, 155, 0.16);
  color: #a8d8b9;
}

.dpt-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.dpt-spacer {
  flex: 1;
}
</style>
