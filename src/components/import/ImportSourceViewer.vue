<script setup lang="ts">
/** 已保存的来源内容（分页读取）；尚未读取或读取失败时说明原因，不触发新的抓取。 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import type { ImportSource } from 'src/models/import';
import { readableError } from './import-labels';

const props = defineProps<{ source: ImportSource }>();
const ctx = injectImportPage();

const note = computed(() =>
  ctx.sourceTextError.value ? readableError(ctx.sourceTextError.value) : '',
);
const text = computed(() => ctx.sourceText.value?.text ?? '');
const nextOffset = computed(() => ctx.sourceText.value?.nextOffset);
const loadMore = () => void ctx.showSource(props.source.id, nextOffset.value);
</script>

<template>
  <div class="isv" aria-live="polite">
    <header class="isv-head">
      <span class="isv-title">{{ source.name }} · 保存的内容</span>
      <button type="button" class="isv-close" aria-label="关闭来源内容" @click="ctx.closeSource">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>
    <p v-if="note" class="isv-note">{{ note }}</p>
    <template v-else-if="text">
      <pre class="isv-text">{{ text }}</pre>
      <Button
        v-if="nextOffset !== undefined"
        label="继续加载"
        size="small"
        text
        @click="loadMore"
      />
    </template>
  </div>
</template>

<style scoped>
.isv {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.isv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.isv-title {
  font-size: 0.8rem;
  font-weight: 600;
}

.isv-close {
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.isv-note {
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.isv-text {
  max-height: 22rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.78rem;
  line-height: 1.7;
  margin: 0;
  font-family: inherit;
}
</style>
