<script setup lang="ts">
/**
 * 新章节：按目标卷分组。每组可改选已有卷或新建卷；逐章可勾选、预览正文、跳过。
 * 目标卷覆盖只收集到 useBookSync，应用时由同步服务处理。
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import type { SyncNewChapter, SyncVolumeTarget } from 'src/models/book-sync';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import { effectiveTarget } from 'src/composables/book-sync/book-sync-rules';
import { getVolumeDisplayTitle } from 'src/utils/novel-utils';
import ChapterPreviewText from './ChapterPreviewText.vue';
import SelectableChapterRow from './SelectableChapterRow.vue';

const {
  changeset,
  volumes,
  selected,
  volumeOverrides,
  working,
  toggle,
  setGroupTarget,
  setSkipped,
} = injectBookSync();

interface Group {
  key: string;
  target: SyncVolumeTarget;
  overridden: boolean;
  chapters: SyncNewChapter[];
}

const groups = computed<Group[]>(() => {
  const result: Group[] = [];
  for (const chapter of changeset.value?.new ?? []) {
    let group = result.find((entry) => entry.key === chapter.groupKey);
    if (!group) {
      group = {
        key: chapter.groupKey,
        target: effectiveTarget(chapter, volumeOverrides.value),
        overridden: volumeOverrides.value.has(chapter.groupKey),
        chapters: [],
      };
      result.push(group);
    }
    group.chapters.push(chapter);
  }
  return result;
});

const editing = ref('');
const newTitle = ref('');
const previewing = ref(new Set<string>());

function targetLabel(target: SyncVolumeTarget): string {
  if ('newTitle' in target) return `新建卷「${target.newTitle}」`;
  const volume = volumes.value.find((entry) => entry.id === target.volumeId);
  return volume ? `放入「${getVolumeDisplayTitle(volume)}」` : '放入已有卷';
}

function isAllSelected(group: Group): boolean {
  return group.chapters.every((chapter) => selected.value.has(chapter.url));
}

function toggleGroup(group: Group): void {
  const on = !isAllSelected(group);
  for (const chapter of group.chapters) toggle(chapter.url, on);
}

function startEdit(group: Group): void {
  editing.value = editing.value === group.key ? '' : group.key;
  newTitle.value = 'newTitle' in group.target ? group.target.newTitle : '';
}

function choose(group: Group, target: SyncVolumeTarget | null): void {
  setGroupTarget(group.key, target);
  editing.value = '';
}

function useNewVolume(group: Group): void {
  const title = newTitle.value.trim();
  if (title) choose(group, { newTitle: title });
}

function togglePreview(url: string): void {
  const next = new Set(previewing.value);
  if (next.has(url)) next.delete(url);
  else next.add(url);
  previewing.value = next;
}
</script>

<template>
  <section class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-plus-circle" aria-hidden="true" />新章节
        <span class="ipl-count">{{ changeset?.new.length ?? 0 }}</span>
      </h3>
    </div>
    <p v-if="groups.length === 0" class="ipl-muted">没有新章节</p>
    <div v-for="group in groups" :key="group.key" class="ncg-group">
      <div class="ncg-head">
        <input
          type="checkbox"
          class="bsw-check"
          :checked="isAllSelected(group)"
          :aria-label="`全选 ${targetLabel(group.target)} 的新章节`"
          @change="toggleGroup(group)"
        />
        <span class="ncg-target">{{ targetLabel(group.target) }}</span>
        <span v-if="group.overridden" class="bsw-badge bsw-badge--info">已改选</span>
        <Button
          label="更改目标卷"
          icon="pi pi-folder-open"
          size="small"
          text
          :disabled="working"
          @click="startEdit(group)"
        />
      </div>
      <div v-if="editing === group.key" class="ncg-editor">
        <div class="ncg-volumes">
          <Button
            v-if="group.overridden"
            label="恢复推断的位置"
            size="small"
            severity="secondary"
            outlined
            @click="choose(group, null)"
          />
          <Button
            v-for="volume in volumes"
            :key="volume.id"
            :label="getVolumeDisplayTitle(volume)"
            size="small"
            severity="secondary"
            outlined
            @click="choose(group, { volumeId: volume.id })"
          />
        </div>
        <div class="ncg-new">
          <InputText
            v-model="newTitle"
            data-testid="bsw-new-volume"
            size="small"
            placeholder="新卷名称"
            @keydown.enter="useNewVolume(group)"
          />
          <Button
            label="使用新卷"
            size="small"
            :disabled="!newTitle.trim()"
            @click="useNewVolume(group)"
          />
        </div>
      </div>
      <ul class="bsw-list">
        <SelectableChapterRow
          v-for="chapter in group.chapters"
          :key="chapter.url"
          :url="chapter.url"
          :title="chapter.title"
        >
          <span class="bsw-actions">
            <Button
              icon="pi pi-eye"
              size="small"
              text
              rounded
              :aria-label="`预览${chapter.title}`"
              @click="togglePreview(chapter.url)"
            />
            <Button
              icon="pi pi-eye-slash"
              size="small"
              text
              rounded
              :aria-label="`跳过${chapter.title}`"
              :disabled="working"
              @click="setSkipped([{ url: chapter.url, title: chapter.title }], true)"
            />
          </span>
          <template v-if="previewing.has(chapter.url)" #detail>
            <ChapterPreviewText :url="chapter.url" />
          </template>
        </SelectableChapterRow>
      </ul>
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped src="../book-sync.css"></style>
<style scoped>
.ncg-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ncg-group + .ncg-group {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ncg-head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0 0.2rem;
}

.ncg-target {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(199, 210, 254, 0.9);
}

.ncg-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.06);
}

.ncg-volumes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  max-height: 8rem;
  overflow-y: auto;
}

.ncg-new {
  display: flex;
  gap: 0.4rem;
}

.ncg-new :deep(input) {
  flex: 1;
  min-width: 0;
}
</style>
