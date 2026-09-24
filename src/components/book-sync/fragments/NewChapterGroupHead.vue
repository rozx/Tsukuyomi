<script setup lang="ts">
/**
 * 一组新章节的目标卷标题：卷名、章数、全选，以及改选已有卷或新建卷的编辑器。
 * 目标卷覆盖只收集到 useBookSync，应用时由同步服务处理。
 */
import { ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import type { SyncVolumeTarget } from 'src/models/book-sync';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import type { NewChapterGroup } from 'src/composables/book-sync/book-sync-rules';
import { getVolumeDisplayTitle } from 'src/utils/novel-utils';

const props = defineProps<{ group: NewChapterGroup }>();
const { volumes, selected, working, toggle, setGroupTarget } = injectBookSync();

const editing = ref(false);
const newTitle = ref('');

function targetName(target: SyncVolumeTarget): string {
  if ('newTitle' in target) return target.newTitle;
  const volume = volumes.value.find((entry) => entry.id === target.volumeId);
  return volume ? getVolumeDisplayTitle(volume) : '已有卷';
}

function targetLabel(target: SyncVolumeTarget): string {
  return `${'newTitle' in target ? '新建卷' : '放入'}「${targetName(target)}」`;
}

function isAllSelected(): boolean {
  return props.group.chapters.every((chapter) => selected.value.has(chapter.url));
}

function toggleGroup(): void {
  const on = !isAllSelected();
  for (const chapter of props.group.chapters) toggle(chapter.url, on);
}

function startEdit(): void {
  editing.value = !editing.value;
  newTitle.value = 'newTitle' in props.group.target ? props.group.target.newTitle : '';
}

function choose(target: SyncVolumeTarget | null): void {
  setGroupTarget(props.group.key, target);
  editing.value = false;
}

function useNewVolume(): void {
  const title = newTitle.value.trim();
  if (title) choose({ newTitle: title });
}
</script>

<template>
  <div class="ncg-head">
    <i
      :class="'newTitle' in group.target ? 'pi pi-folder-plus' : 'pi pi-folder'"
      class="ncg-icon"
      aria-hidden="true"
    />
    <span class="ncg-target">
      <span class="ncg-kind">{{ 'newTitle' in group.target ? '新建卷' : '放入' }}</span
      >「{{ targetName(group.target) }}」
    </span>
    <span class="ncg-meta">{{ group.chapters.length }} 章</span>
    <span v-if="group.overridden" class="bsw-badge bsw-badge--info">已改选</span>
    <span class="ncg-tools">
      <Button
        :label="isAllSelected() ? '全部取消' : '全选'"
        :aria-label="`${isAllSelected() ? '取消全选' : '全选'} ${targetLabel(group.target)} 的新章节`"
        size="small"
        text
        @click="toggleGroup()"
      />
      <Button
        label="更改目标卷"
        icon="pi pi-pencil"
        size="small"
        text
        :disabled="working"
        @click="startEdit()"
      />
    </span>
  </div>
  <div v-if="editing" class="ncg-editor">
    <div class="ncg-volumes">
      <Button
        v-if="group.overridden"
        label="恢复推断的位置"
        size="small"
        severity="secondary"
        outlined
        @click="choose(null)"
      />
      <Button
        v-for="volume in volumes"
        :key="volume.id"
        :label="getVolumeDisplayTitle(volume)"
        size="small"
        severity="secondary"
        outlined
        @click="choose({ volumeId: volume.id })"
      />
    </div>
    <div class="ncg-new">
      <InputText
        v-model="newTitle"
        data-testid="bsw-new-volume"
        size="small"
        placeholder="新卷名称"
        @keydown.enter="useNewVolume()"
      />
      <Button label="使用新卷" size="small" :disabled="!newTitle.trim()" @click="useNewVolume()" />
    </div>
  </div>
</template>

<style scoped src="../book-sync.css"></style>
<style scoped>
.ncg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.35rem 0.3rem 0.7rem;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.09);
}

.ncg-icon {
  font-size: 0.85rem;
  color: rgb(165, 180, 252);
}

.ncg-target {
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(224, 231, 255, 0.95);
}

.ncg-kind {
  margin-right: 0.1rem;
  font-weight: 400;
  color: rgba(199, 210, 254, 0.7);
}

.ncg-meta {
  font-size: 0.72rem;
  color: rgba(199, 210, 254, 0.6);
}

.ncg-tools {
  display: flex;
  gap: 0.1rem;
  margin-left: auto;
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
