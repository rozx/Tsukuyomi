<script setup lang="ts">
/**
 * 导入方案：先根据当前草稿生成真实差异（元信息、卷章、段落与译文影响），用户检查后确认才写书库。
 * 草稿修改后旧方案失效，需要重新检查；应用后如书籍有后续修改，撤销会被禁用并说明原因。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useBooksStore } from 'src/stores/books';
import { getChapterDisplayTitle, getVolumeDisplayTitle } from 'src/utils/novel-utils';
import type { ImportOperation, ImportPlan } from 'src/models/import';
import { METADATA_FIELDS, formatTime, readableError } from './import-labels';

const ctx = injectImportPage();
const store = ctx.store;
const booksStore = useBooksStore();
const confirm = useConfirm();
const router = useRouter();

const task = computed(() => store.task);
const plan = computed<ImportPlan | null>(() => store.plan);
const stale = computed(() =>
  Boolean(plan.value && task.value && plan.value.draftRevision !== task.value.draft.revision),
);
const awaitingAnswer = computed(() => {
  const question = task.value?.pendingQuestion;
  return Boolean(question?.required && !question.answer);
});
const operation = computed(() =>
  store.operations.find((entry) => entry.id === plan.value?.operationId),
);
const alreadyApplied = computed(() => operation.value?.state === 'applied');
const canPreview = computed(() => Boolean(task.value) && !store.isRunning && !awaitingAnswer.value);
const canApply = computed(
  () =>
    Boolean(plan.value) &&
    !stale.value &&
    !plan.value!.conflicts.length &&
    !store.isRunning &&
    !awaitingAnswer.value &&
    !alreadyApplied.value &&
    store.pendingAction !== 'apply',
);

const targetLabel = computed(() => {
  if (!plan.value) return '';
  const title = plan.value.book.title || '（未命名）';
  return plan.value.targetKind === 'new' ? `新建《${title}》` : `更新《${title}》`;
});
const summary = computed(() => plan.value?.summary);
const completeness = computed(() => plan.value?.completeness);

const fieldLabel = (field: string) =>
  METADATA_FIELDS[field as keyof typeof METADATA_FIELDS] ?? field;
const CHANGE_LABEL = { insert: '新增', update: '更新', restructure: '重组' } as const;

// 匹配冲突：选择覆盖目标书中的哪一章，或作为新章节
const targetChapters = computed(() => {
  const target = task.value?.draft.target;
  if (target?.kind !== 'existing') return [];
  const book = booksStore.getBookById(target.bookId);
  return [
    { label: '作为新章节导入', value: '__new__' },
    ...(book?.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? []).map((chapter) => ({
        label: `${getVolumeDisplayTitle(volume)} · ${getChapterDisplayTitle(chapter)}`,
        value: chapter.id,
      })),
    ),
  ];
});
const resolveMatch = (draftChapterId: string, value: string) =>
  void store.resolveMatch(draftChapterId, value === '__new__' ? [] : [value]);

const settingsChoices = (draftChapterId: string) => {
  const change = plan.value?.chapterChanges?.find(
    (entry) => entry.draftChapterId === draftChapterId,
  );
  const book = plan.value ? booksStore.getBookById(plan.value.targetBookId) : undefined;
  const title = (id: string) => {
    const chapter = book?.volumes
      ?.flatMap((volume) => volume.chapters ?? [])
      .find((entry) => entry.id === id);
    return chapter ? getChapterDisplayTitle(chapter) : id;
  };
  return (change?.oldChapterIds ?? []).map((id) => ({ label: title(id), value: id }));
};

const requestApply = () => {
  if (!plan.value || !summary.value) return;
  const cleared = summary.value.clearedVersions
    ? `将清空 ${summary.value.clearedParagraphs} 段原文已修订段落的 ${summary.value.clearedVersions} 个译文版本。`
    : '不会清空已有译文。';
  const partial = summary.value.partial ? '这是部分导入，缺失或完整性未确认的章节不会被处理。' : '';
  confirm.require({
    header: '确认导入到书库',
    message: `${targetLabel.value}：${summary.value.selectedChapters} 章。${cleared}${partial}确认后才会写入书库，可在书籍没有后续修改前整次撤销。`,
    icon: 'pi pi-exclamation-circle',
    acceptLabel: '确认导入',
    rejectLabel: '再检查一下',
    accept: () => void store.applyPlan(),
  });
};

// 撤销可用性：逐条查询，后续修改会使撤销不可用
const revertState = ref<Record<string, { available: boolean; reason?: string }>>({});
watch(
  () => [store.operations, store.task?.updatedAt] as const,
  async ([operations]) => {
    const next: Record<string, { available: boolean; reason?: string }> = {};
    for (const entry of operations.filter((item) => item.state !== 'planned')) {
      try {
        next[entry.id] = await store.revertStatus(entry.id);
      } catch (error) {
        next[entry.id] = { available: false, reason: readableError(String(error)) };
      }
    }
    revertState.value = next;
  },
  { immediate: true },
);
const history = computed(() => store.operations.filter((entry) => entry.state !== 'planned'));
const requestRevert = (entry: ImportOperation) => {
  confirm.require({
    header: '撤销这次导入',
    message:
      entry.plan.targetKind === 'new'
        ? '将删除这次导入新建的小说及其正文。'
        : '将恢复导入前的元信息、卷章、原文和全部译文。',
    icon: 'pi pi-undo',
    acceptLabel: '撤销导入',
    rejectLabel: '取消',
    acceptClass: 'p-button-danger',
    accept: () => void store.revertOperation(entry.id),
  });
};
</script>

<template>
  <section v-if="task" class="ipp" aria-label="导入方案">
    <div class="ipp-actions">
      <Button
        icon="pi pi-list-check"
        :label="plan ? '重新生成方案' : '生成导入方案'"
        size="small"
        :disabled="!canPreview"
        :loading="store.pendingAction === 'preview'"
        @click="store.previewPlan"
      />
      <Button
        icon="pi pi-check"
        label="确认导入"
        size="small"
        severity="success"
        :disabled="!canApply"
        :loading="store.pendingAction === 'apply'"
        @click="requestApply"
      />
    </div>
    <p class="ipp-hint">
      方案只根据当前草稿计算实际变化，生成后也不会写入书库；只有点击「确认导入」并再次确认后才会应用。
    </p>

    <p v-if="!plan" class="ipp-empty">
      还没有导入方案。整理好草稿后生成方案，检查变化再决定是否导入。
    </p>

    <template v-else>
      <Message v-if="stale" severity="warn" :closable="false">
        草稿在生成方案后已修改，这个方案已过时，请重新生成后再确认。
      </Message>
      <Message v-if="alreadyApplied" severity="success" :closable="false">
        这个方案已导入书库。
        <Button
          label="打开小说"
          size="small"
          text
          @click="router.push(`/books/${plan.targetBookId}`)"
        />
      </Message>

      <div class="ipp-summary">
        <div class="ipp-target">{{ targetLabel }}</div>
        <div v-if="summary" class="ipp-stats">
          <span>选中 {{ summary.selectedChapters }} 章</span>
          <span>新增 {{ summary.insertedParagraphs }} 段</span>
          <span>修订 {{ summary.revisedParagraphs }} 段</span>
          <span>移动 {{ summary.movedParagraphs }} 段</span>
          <span>删除 {{ summary.removedParagraphs }} 段</span>
        </div>
        <div
          v-if="summary"
          class="ipp-loss"
          :class="{ 'ipp-loss--none': !summary.clearedVersions }"
        >
          <i class="pi pi-language" aria-hidden="true" />
          <template v-if="summary.clearedVersions">
            原文修订的 {{ summary.clearedParagraphs }} 段将清空共
            {{ summary.clearedVersions }} 个译文版本
          </template>
          <template v-else>不会清空任何已有译文</template>
        </div>
        <div v-if="summary && !summary.hasChanges" class="ipp-hint">
          方案与书库现状一致，没有需要写入的变化。
        </div>
      </div>

      <div v-if="completeness" class="ipp-block">
        <div class="ipp-subtitle">完整性</div>
        <p class="ipp-text">
          <template v-if="completeness.confirmed && completeness.knownTotal !== undefined">
            目录已确认共 {{ completeness.knownTotal }} 章。
          </template>
          <template v-else>完整性尚未确认，只能导入当前已发现的范围。</template>
          <template v-if="completeness.missing.length">
            缺失 {{ completeness.missing.length }} 项：{{
              completeness.missing.slice(0, 12).join('、')
            }}<template v-if="completeness.missing.length > 12"> 等</template>。
          </template>
        </p>
      </div>

      <div v-if="plan.conflicts.length" class="ipp-block">
        <div class="ipp-subtitle">需要处理后才能导入（{{ plan.conflicts.length }}）</div>
        <ul class="ipp-conflicts">
          <li v-for="(conflict, index) in plan.conflicts" :key="index" class="ipp-conflict">
            <span>{{ readableError(conflict.message) }}</span>
            <Select
              v-if="
                conflict.code === 'CHAPTER_MATCH_REQUIRED' &&
                conflict.chapterId &&
                targetChapters.length
              "
              :options="targetChapters"
              option-label="label"
              option-value="value"
              filter
              placeholder="选择对应关系"
              size="small"
              class="ipp-select"
              :disabled="stale || store.isRunning"
              @update:model-value="(value: string) => resolveMatch(conflict.chapterId!, value)"
            />
            <Select
              v-else-if="conflict.code === 'CHAPTER_SETTINGS_CONFLICT' && conflict.chapterId"
              :options="settingsChoices(conflict.chapterId)"
              option-label="label"
              option-value="value"
              placeholder="沿用哪一章的设置"
              size="small"
              class="ipp-select"
              :disabled="stale || store.isRunning"
              @update:model-value="
                (value: string) => store.chooseChapterSettings(conflict.chapterId!, value)
              "
            />
            <Button
              v-else-if="conflict.code === 'TARGET_CONFIRMATION_REQUIRED'"
              label="确认更新这本小说"
              size="small"
              text
              :disabled="stale || store.isRunning"
              @click="store.confirmTarget"
            />
          </li>
        </ul>
      </div>

      <div v-if="plan.replacements?.some((entry) => !entry.confirmed)" class="ipp-block">
        <div class="ipp-subtitle">多段替换（需确认译文损失）</div>
        <ul class="ipp-conflicts">
          <li
            v-for="entry in plan.replacements.filter((item) => !item.confirmed)"
            :key="entry.signature"
            class="ipp-conflict"
          >
            <span>
              {{ entry.oldKeys.length }} 段旧原文将被 {{ entry.newKeys.length }} 段新原文替换，清空
              {{ entry.clearedVersions }} 个译文版本
            </span>
            <Button
              label="确认替换"
              size="small"
              text
              :disabled="stale || store.isRunning"
              @click="store.confirmReplacement(entry.signature)"
            />
          </li>
        </ul>
      </div>

      <div v-if="plan.metadataChanges.length" class="ipp-block">
        <div class="ipp-subtitle">元信息变化</div>
        <ul class="ipp-list">
          <li v-for="change in plan.metadataChanges" :key="change.field">
            <span class="ipp-field">{{ fieldLabel(change.field) }}</span>
            <span v-if="change.before" class="ipp-before">{{ change.before }}</span>
            <i v-if="change.before" class="pi pi-arrow-right ipp-arrow" aria-hidden="true" />
            <span>{{ change.after }}</span>
          </li>
        </ul>
      </div>

      <div v-if="plan.chapterChanges?.length" class="ipp-block">
        <div class="ipp-subtitle">章节变化（{{ plan.chapterChanges.length }}）</div>
        <ul class="ipp-list ipp-list--scroll">
          <li v-for="change in plan.chapterChanges" :key="change.draftChapterId">
            <Tag :value="CHANGE_LABEL[change.kind]" severity="secondary" />
            <span>{{ change.title }}</span>
          </li>
        </ul>
      </div>
    </template>

    <div v-if="history.length" class="ipp-block">
      <div class="ipp-subtitle">导入记录</div>
      <ul class="ipp-history">
        <li v-for="entry in history" :key="entry.id" class="ipp-history-item">
          <div class="ipp-history-main">
            <span
              >{{ entry.plan.targetKind === 'new' ? '新建' : '更新' }}《{{
                entry.plan.book.title
              }}》</span
            >
            <span class="ipp-history-time">
              {{ entry.state === 'applied' ? '导入于' : '撤销于' }}
              {{
                formatTime(
                  (entry.state === 'applied' ? entry.appliedAt : entry.revertedAt) ??
                    entry.plan.createdAt,
                )
              }}
            </span>
            <span v-if="revertState[entry.id]?.reason" class="ipp-history-reason">
              {{ revertState[entry.id]!.reason }}
            </span>
          </div>
          <Button
            v-if="entry.state === 'applied'"
            icon="pi pi-undo"
            label="撤销"
            size="small"
            severity="danger"
            text
            :disabled="!revertState[entry.id]?.available || store.isRunning"
            :loading="store.pendingAction === 'revert'"
            @click="requestRevert(entry)"
          />
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.ipp {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.ipp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ipp-hint,
.ipp-empty,
.ipp-text {
  font-size: 0.76rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.ipp-summary {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.ipp-target {
  font-weight: 600;
}

.ipp-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.75);
}

.ipp-loss {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: rgb(253, 186, 116);
}

.ipp-loss--none {
  color: rgb(134, 239, 172);
}

.ipp-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ipp-subtitle {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.8);
}

.ipp-conflicts,
.ipp-list,
.ipp-history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ipp-conflict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.75rem;
  font-size: 0.78rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.2);
}

.ipp-select {
  min-width: 12rem;
  max-width: 100%;
}

.ipp-list li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  flex-wrap: wrap;
}

.ipp-list--scroll {
  max-height: 16rem;
  overflow-y: auto;
}

.ipp-field {
  color: rgba(226, 232, 240, 0.55);
  min-width: 2.5rem;
}

.ipp-before {
  color: rgba(226, 232, 240, 0.45);
  text-decoration: line-through;
}

.ipp-arrow {
  font-size: 0.65rem;
  color: rgba(226, 232, 240, 0.4);
}

.ipp-history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.ipp-history-main {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.8rem;
  min-width: 0;
}

.ipp-history-time,
.ipp-history-reason {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.5);
}
</style>
