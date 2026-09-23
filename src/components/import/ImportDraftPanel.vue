<script setup lang="ts">
/**
 * 草稿直接编辑：元信息、导入目标、卷章标题／顺序／归属与导入选择。
 * 所有修改都经 ImportDraftService 的具名操作提交到同一草稿，月詠随后读取即可看到；
 * 基于旧版本的修改会被拒绝并重新载入，不会覆盖较新的内容。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import ImportDraftMetadata from './ImportDraftMetadata.vue';
import ImportMetadataCandidates from './ImportMetadataCandidates.vue';
import ImportDraftVolume from './ImportDraftVolume.vue';
import { useDraftLock } from './import-draft';
import { draftOverview } from 'src/composables/import-page/import-workspace-overview';

const store = useImportWorkspaceStore();
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
  void store.editDraft([{ op: 'upsert_volume', title: `新卷 ${volumes.value.length + 1}` }]);
</script>

<template>
  <section v-if="draft" class="idp" aria-label="导入草稿">
    <div v-if="needsChoice" class="ipl-banner ipl-banner--warn" role="status">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span
        >检测到多个作品或来源归属变化，请先在月詠对话中选择本次导入的小说，之后才能编辑卷章。</span
      >
    </div>

    <section class="ipl-card">
      <div class="ipl-card-head">
        <h3 class="ipl-card-title"><i class="pi pi-id-card" aria-hidden="true" />基本信息</h3>
      </div>
      <ImportDraftMetadata />
    </section>

    <ImportMetadataCandidates />

    <section class="ipl-card">
      <div class="ipl-card-head">
        <h3 class="ipl-card-title">
          <i class="pi pi-sitemap" aria-hidden="true" />卷章结构
          <span class="ipl-count">{{ overview.volumes }} 卷 · {{ overview.chapters }} 章</span>
        </h3>
        <Button
          icon="pi pi-plus"
          label="新卷"
          size="small"
          outlined
          :disabled="locked"
          @click="addVolume"
        />
      </div>

      <div v-if="overview.chapters" class="idp-stats">
        <span>已选 {{ overview.selected }} / {{ overview.chapters }} 章导入</span>
        <span class="ipl-status ipl-status--success">已取得正文 {{ overview.ready }}</span>
        <span v-if="overview.pending" class="ipl-status ipl-status--secondary">
          待处理 {{ overview.pending }}
        </span>
        <span v-if="overview.missing" class="ipl-status ipl-status--warn">
          缺失 {{ overview.missing }}
        </span>
        <span v-if="overview.failed" class="ipl-status ipl-status--danger">
          提取失败 {{ overview.failed }}
        </span>
      </div>

      <div v-if="isEmpty" class="idp-empty">
        <i class="pi pi-book" aria-hidden="true" />
        <span>草稿还没有卷章。提供来源后，让月詠检查并整理，或在对话中说明希望的分卷方式。</span>
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
        @move-volume="moveVolume"
        @move-chapter="moveChapter"
      />

      <div v-if="overview.orphans" class="ipl-banner ipl-banner--warn">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>有 {{ overview.orphans }} 章尚未归属任何卷，请让月詠整理或新建卷后移动。</span>
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

.idp-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.9rem;
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.7);
}

.idp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.5rem;
  font-size: 0.78rem;
  text-align: center;
  color: rgba(226, 232, 240, 0.55);
}

.idp-empty i {
  font-size: 1.4rem;
  color: rgba(165, 180, 252, 0.6);
}
</style>
