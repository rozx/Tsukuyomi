<script setup lang="ts">
/** 已保存的来源内容（分页读取）；尚未读取或读取失败时说明原因，不触发新的抓取。 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import type { ImportSource } from 'src/models/import';
import { SOURCE_ICON, SOURCE_STATUS, readableError } from './import-labels';

const props = defineProps<{ source: ImportSource }>();
const ctx = injectImportPage();

const note = computed(() =>
  ctx.sourceTextError.value ? readableError(ctx.sourceTextError.value) : '',
);
const text = computed(() => ctx.sourceText.value?.text ?? '');
const nextOffset = computed(() => ctx.sourceText.value?.nextOffset);
const status = computed(() => SOURCE_STATUS[props.source.status]);
const loadMore = () => void ctx.showSource(props.source.id, nextOffset.value);
</script>

<template>
  <section class="ipl-card isv" aria-live="polite" aria-label="来源内容">
    <div class="ipl-card-head isv-head">
      <h3 class="ipl-card-title isv-title">
        <i :class="SOURCE_ICON[source.kind]" aria-hidden="true" />
        <span class="isv-name">{{ source.relativePath || source.name }}</span>
      </h3>
      <span class="ipl-status" :class="`ipl-status--${status.severity}`">{{ status.label }}</span>
      <button type="button" class="isv-close" aria-label="关闭来源内容" @click="ctx.closeSource">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>
    <p class="ipl-muted">保存的内容（只读，不会重新抓取）</p>
    <p v-if="note" class="isv-note">{{ note }}</p>
    <template v-else-if="text">
      <pre class="isv-text">{{ text }}</pre>
      <Button
        v-if="nextOffset !== undefined"
        icon="pi pi-angle-double-down"
        label="继续加载"
        size="small"
        text
        @click="loadMore"
      />
    </template>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.isv-head {
  flex-wrap: nowrap;
}

.isv-title {
  flex: 1;
  min-width: 0;
}

.isv-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.isv-close {
  flex-shrink: 0;
  width: 1.8rem;
  height: 1.8rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.isv-close:hover {
  background: rgba(255, 255, 255, 0.06);
}

.isv-note {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.7);
  background: rgba(0, 0, 0, 0.18);
}

.isv-text {
  max-height: 28rem;
  overflow: auto;
  margin: 0;
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 0.8rem;
  line-height: 1.8;
}
</style>
