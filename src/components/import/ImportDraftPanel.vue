<script setup lang="ts">
/**
 * 草稿直接编辑：元信息、导入目标、卷章标题／顺序／归属与导入选择。
 * 所有修改都经 ImportDraftService 的具名操作提交到同一草稿，月詠随后读取即可看到；
 * 基于旧版本的修改会被拒绝并重新载入，不会覆盖较新的内容。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import ImportDraftMetadata from './ImportDraftMetadata.vue';
import ImportMetadataCandidates from './ImportMetadataCandidates.vue';
import ImportDraftVolume from './ImportDraftVolume.vue';
import { useDraftLock } from './import-draft';
import { draftOverview } from 'src/composables/import-page/import-workspace-overview';
import { draftChapterWindows } from 'src/composables/import-page/import-draft-windows';

/** structureFirst：手机引导流程里卷章结构排在最前，书籍信息折叠为一行摘要 */
const props = withDefaults(defineProps<{ structureFirst?: boolean }>(), {
  structureFirst: false,
});
const basicsOpen = ref(false);
const basicsSummary = computed(() =>
  [draft.value?.metadata.title?.value, draft.value?.metadata.author?.value]
    .filter(Boolean)
    .join(' · '),
);
const store = useImportWorkspaceStore();
const ctx = injectImportPage();
const { t } = useI18n();
const locked = useDraftLock();

const draft = computed(() => store.task?.draft);
const needsChoice = computed(() => Boolean(draft.value?.novelScope.needsChoice));
const chapters = computed(() => draft.value?.chapters ?? []);
const volumes = computed(() => draft.value?.volumes ?? []);
const overview = computed(() =>
  draftOverview({ volumes: volumes.value, chapters: chapters.value }),
);
const isEmpty = computed(() => !chapters.value.length && !volumes.value.length);
const firstChapterId = computed(() => chapters.value[0]?.id);
const lastChapterId = computed(() => chapters.value.at(-1)?.id);
const volumeOptions = computed(() =>
  volumes.value.map((volume) => ({ label: volume.title, value: volume.id })),
);
const groups = computed(() =>
  volumes.value.map((volume, index) => ({
    volume,
    index,
    first: index === 0,
    last: index === volumes.value.length - 1,
    chapters: chapters.value.filter((chapter) => chapter.volumeId === volume.id),
  })),
);
// 大草稿分批渲染：各卷显示的章节数，用户选择记录在页面上下文中以跨断点保留
const windows = computed(() =>
  draftChapterWindows(
    groups.value.map((group) => ({ id: group.volume.id, count: group.chapters.length })),
    ctx.draftWindows.value,
  ),
);
const show = (volumeId: string, count: number) => {
  ctx.draftWindows.value = { ...ctx.draftWindows.value, [volumeId]: count };
};
// 章节按显示顺序（先卷后章）连续编号，便于与月詠对话时指代
const chapterNumbers = computed(() =>
  Object.fromEntries(
    groups.value
      .flatMap((group) => group.chapters)
      .map((chapter, index) => [chapter.id, index + 1]),
  ),
);

/** 在完整顺序中交换相邻两项，生成全量排序操作。 */
const swapped = (ids: string[], id: string, delta: number): string[] | undefined => {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return undefined;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
const moveChapter = (chapterId: string, delta: number) => {
  const ids = swapped(
    chapters.value.map((chapter) => chapter.id),
    chapterId,
    delta,
  );
  if (ids) void store.editDraft([{ op: 'reorder_chapters', chapterIds: ids }]);
};
const moveVolume = (volumeId: string, delta: number) => {
  const ids = swapped(
    volumes.value.map((volume) => volume.id),
    volumeId,
    delta,
  );
  if (ids) void store.editDraft([{ op: 'reorder_volumes', volumeIds: ids }]);
};
const addVolume = () =>
  void store.editDraft([
    {
      op: 'upsert_volume',
      title: t('importUi.draft.newVolumeTitle', { number: volumes.value.length + 1 }),
    },
  ]);
</script>

<template>
  <section
    v-if="draft"
    class="idp"
    :class="{ 'idp--structure-first': props.structureFirst }"
    :aria-label="t('importUi.draft.region')"
  >
    <div v-if="needsChoice" class="ipl-banner ipl-banner--warn" role="status">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>{{ t('importUi.draft.needsChoice') }}</span>
    </div>

    <section class="ipl-card idp-basics">
      <div class="ipl-card-head">
        <h3 class="ipl-card-title">
          <i class="pi pi-id-card" aria-hidden="true" />{{ t('importUi.draft.basics') }}
        </h3>
        <button
          v-if="props.structureFirst"
          type="button"
          class="idp-basics-toggle"
          :aria-expanded="basicsOpen"
          @click="basicsOpen = !basicsOpen"
        >
          <span class="idp-basics-summary">{{ basicsSummary }}</span>
          <i
            class="pi"
            :class="basicsOpen ? 'pi-chevron-up' : 'pi-chevron-down'"
            aria-hidden="true"
          />
        </button>
      </div>
      <ImportDraftMetadata v-if="!props.structureFirst || basicsOpen" />
    </section>

    <ImportMetadataCandidates />

    <section class="ipl-card idp-structure">
      <div class="ipl-card-head">
        <h3 class="ipl-card-title">
          <i class="pi pi-sitemap" aria-hidden="true" />{{ t('importUi.draft.structure') }}
          <span class="ipl-count">{{
            t('importUi.draft.structureCount', {
              volumes: overview.volumes,
              chapters: overview.chapters,
            })
          }}</span>
        </h3>
        <div class="idp-toolbar">
          <Button
            icon="pi pi-trash"
            :label="t('importUi.draft.clear')"
            :aria-label="t('importUi.draft.clearLabel')"
            size="small"
            text
            severity="danger"
            :disabled="locked || isEmpty"
            @click="ctx.requestDraftRemoval({ op: 'clear_structure' })"
          />
          <Button
            icon="pi pi-plus"
            :label="t('importUi.draft.newVolume')"
            size="small"
            outlined
            :disabled="locked"
            @click="addVolume"
          />
        </div>
      </div>

      <div v-if="overview.chapters" class="idp-stats">
        <span>{{
          t('importUi.draft.selected', {
            selected: overview.selected,
            count: overview.chapters,
          })
        }}</span>
        <span class="ipl-status ipl-status--success">{{
          t('importUi.draft.ready', { count: overview.ready })
        }}</span>
        <span v-if="overview.pending" class="ipl-status ipl-status--secondary">
          {{ t('importUi.draft.pending', { count: overview.pending }) }}
        </span>
        <span v-if="overview.missing" class="ipl-status ipl-status--warn">
          {{ t('importUi.draft.missing', { count: overview.missing }) }}
        </span>
        <span v-if="overview.failed" class="ipl-status ipl-status--danger">
          {{ t('importUi.draft.failed', { count: overview.failed }) }}
        </span>
      </div>

      <div v-if="isEmpty" class="idp-empty">
        <i class="pi pi-book" aria-hidden="true" />
        <span>{{ t('importUi.draft.empty') }}</span>
      </div>

      <ImportDraftVolume
        v-for="group in groups"
        :key="group.volume.id"
        :volume="group.volume"
        :index="group.index"
        :chapters="group.chapters"
        :first="group.first"
        :last="group.last"
        :first-chapter-id="firstChapterId"
        :last-chapter-id="lastChapterId"
        :volume-options="volumeOptions"
        :chapter-numbers="chapterNumbers"
        :shown="windows[group.volume.id] ?? group.chapters.length"
        @move-volume="moveVolume"
        @move-chapter="moveChapter"
        @show="show"
      />

      <div v-if="overview.orphans" class="ipl-banner ipl-banner--warn">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>{{ t('importUi.draft.orphans', { count: overview.orphans }) }}</span>
      </div>
    </section>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.idp {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

/* 手机引导流程：卷章结构排最前 */
.idp--structure-first .idp-structure {
  order: -1;
}

.idp-basics-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  max-width: 60%;
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  font-size: 0.78rem;
  color: var(--moon-50-opacity-60);
}

.idp-basics-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idp-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.9rem;
  font-size: 0.74rem;
  color: rgba(247, 244, 236, 0.7);
}

.idp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.idp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.5rem;
  font-size: 0.78rem;
  text-align: center;
  color: rgba(247, 244, 236, 0.55);
}

.idp-empty i {
  font-size: 1.4rem;
  color: rgba(163, 183, 207, 0.6);
}
</style>
