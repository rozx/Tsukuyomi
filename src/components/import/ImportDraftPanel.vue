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

const store = useImportWorkspaceStore();
const locked = useDraftLock();

const draft = computed(() => store.task?.draft);
const needsChoice = computed(() => Boolean(draft.value?.novelScope.needsChoice));
const chapters = computed(() => draft.value?.chapters ?? []);
const volumes = computed(() => draft.value?.volumes ?? []);
const isEmpty = computed(() => !chapters.value.length && !volumes.value.length);
const firstChapterId = computed(() => chapters.value[0]?.id);
const lastChapterId = computed(() => chapters.value.at(-1)?.id);
const volumeOptions = computed(() =>
  volumes.value.map((volume) => ({ label: volume.title, value: volume.id })),
);
const groups = computed(() =>
  volumes.value.map((volume, index) => ({
    volume,
    first: index === 0,
    last: index === volumes.value.length - 1,
    chapters: chapters.value.filter((chapter) => chapter.volumeId === volume.id),
  })),
);
const orphanCount = computed(() => {
  const ids = new Set(volumes.value.map((volume) => volume.id));
  return chapters.value.filter((chapter) => !ids.has(chapter.volumeId)).length;
});

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
    <p v-if="needsChoice" class="idp-note idp-note--warn">
      检测到多个作品或来源归属变化，请先在月詠对话中选择本次导入的小说，之后才能编辑卷章。
    </p>

    <ImportDraftMetadata />
    <ImportMetadataCandidates />

    <div class="idp-structure">
      <div class="idp-structure-head">
        <span class="idp-subtitle">卷章（{{ chapters.length }} 章）</span>
        <Button
          icon="pi pi-plus"
          label="新卷"
          size="small"
          text
          :disabled="locked"
          @click="addVolume"
        />
      </div>

      <p v-if="isEmpty" class="idp-note">
        草稿还没有卷章。提供来源后，让月詠检查并整理，或在对话中说明希望的分卷方式。
      </p>

      <ImportDraftVolume
        v-for="group in groups"
        :key="group.volume.id"
        :volume="group.volume"
        :chapters="group.chapters"
        :first="group.first"
        :last="group.last"
        :first-chapter-id="firstChapterId"
        :last-chapter-id="lastChapterId"
        :volume-options="volumeOptions"
        @move-volume="moveVolume"
        @move-chapter="moveChapter"
      />

      <p v-if="orphanCount" class="idp-note idp-note--warn">
        有 {{ orphanCount }} 章尚未归属任何卷，请让月詠整理或新建卷后移动。
      </p>
    </div>
  </section>
</template>

<style scoped>
.idp {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.idp-note {
  font-size: 0.78rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.idp-note--warn {
  color: rgb(253, 224, 71);
}

.idp-subtitle {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.75);
}

.idp-structure {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.idp-structure-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
