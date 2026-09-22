<script setup lang="ts">
/**
 * 来源管理：添加网址、文件或文件夹只登记访问范围，不读取、不解析；月詠通过工具读取后
 * 才会出现已检查／已提取状态。列表区分用户提供与月詠发现的来源，并显示父子关系。
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import type { ImportSource } from 'src/models/import';
import { SOURCE_ICON, SOURCE_STATUS, readableError } from './import-labels';

const ctx = injectImportPage();
const store = ctx.store;

const url = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const folderSupported =
  typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;
const adding = computed(() => store.pendingAction === 'add-source');

const addUrl = async () => {
  if (!url.value.trim()) return;
  await store.addUrl(url.value);
  if (!store.error) url.value = '';
};

const onFiles = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  await store.addFiles(files);
};

const onFolder = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  await store.addDirectory(
    files.map((file) => ({ file, path: file.webkitRelativePath || file.name })),
  );
};

interface Row {
  source: ImportSource;
  depth: number;
}

/** 按父子关系展开成带缩进的行；父来源不在列表中时作为根。 */
const rows = computed<Row[]>(() => {
  const ids = new Set(store.sources.map((source) => source.id));
  const children = new Map<string, ImportSource[]>();
  const roots: ImportSource[] = [];
  for (const source of store.sources) {
    const parent = source.parentSourceId;
    if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), source]);
    else roots.push(source);
  }
  const result: Row[] = [];
  const visit = (source: ImportSource, depth: number) => {
    result.push({ source, depth });
    for (const child of children.get(source.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return result;
});

const referenced = computed(
  () => new Set((ctx.preview.value?.sources ?? []).map((source) => source.id)),
);

const rowClass = (source: ImportSource) => ({
  'isp-row--selected': ctx.selectedSourceId.value === source.id,
  'isp-row--referenced': referenced.value.has(source.id),
});

const selectedSource = computed(() =>
  store.sources.find((source) => source.id === ctx.selectedSourceId.value),
);
</script>

<template>
  <section class="isp" aria-label="来源">
    <div class="isp-add">
      <form class="isp-url" @submit.prevent="addUrl">
        <InputText
          v-model="url"
          placeholder="小说目录或章节网址（http/https）"
          aria-label="来源网址"
          class="isp-url-input"
        />
        <Button
          type="submit"
          label="添加网址"
          size="small"
          :disabled="!url.trim()"
          :loading="adding"
        />
      </form>
      <div class="isp-pick">
        <Button
          icon="pi pi-file"
          label="选择文件"
          size="small"
          severity="secondary"
          @click="fileInput?.click()"
        />
        <Button
          v-if="folderSupported"
          icon="pi pi-folder-open"
          label="选择文件夹"
          size="small"
          severity="secondary"
          @click="folderInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          aria-hidden="true"
          tabindex="-1"
          @change="onFiles"
        />
        <input
          v-if="folderSupported"
          ref="folderInput"
          type="file"
          multiple
          webkitdirectory
          class="hidden"
          aria-hidden="true"
          tabindex="-1"
          @change="onFolder"
        />
      </div>
      <p class="isp-hint">
        添加来源只登记访问范围，不会立即读取；月詠检查后才会读取内容。支持 TXT、Markdown、HTML、EPUB
        等格式。需要登录或验证的网站请改为提供文件。
      </p>
      <p v-if="!folderSupported" class="isp-hint">
        当前环境不支持选择文件夹，可以一次选择多个文件。
      </p>
    </div>

    <p v-if="!rows.length" class="isp-empty">还没有来源。</p>
    <ul v-else class="isp-list">
      <li
        v-for="{ source, depth } in rows"
        :key="source.id"
        class="isp-row"
        :class="rowClass(source)"
        :style="{ paddingLeft: `${0.6 + depth * 1.1}rem` }"
      >
        <button type="button" class="isp-row-main" @click="ctx.showSource(source.id)">
          <i :class="SOURCE_ICON[source.kind]" class="isp-icon" aria-hidden="true" />
          <span class="isp-name-wrap">
            <span class="isp-name">{{ source.relativePath || source.name }}</span>
            <span v-if="source.url && source.url !== source.name" class="isp-url-text">{{
              source.url
            }}</span>
            <span v-if="source.error" class="isp-error">{{
              readableError(source.error.message)
            }}</span>
          </span>
        </button>
        <span class="isp-tags">
          <Tag
            :value="source.origin === 'user' ? '用户提供' : '月詠发现'"
            :severity="source.origin === 'user' ? 'secondary' : 'info'"
          />
          <Tag v-if="source.purpose === 'metadata-only'" value="仅元信息" severity="secondary" />
          <Tag
            :value="SOURCE_STATUS[source.status].label"
            :severity="SOURCE_STATUS[source.status].severity"
          />
        </span>
      </li>
    </ul>

    <div v-if="selectedSource" class="isp-viewer" aria-live="polite">
      <header class="isp-viewer-head">
        <span class="isp-viewer-title">{{ selectedSource.name }} · 保存的内容</span>
        <button type="button" class="isp-close" aria-label="关闭来源内容" @click="ctx.closeSource">
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </header>
      <p v-if="ctx.sourceTextError.value" class="isp-viewer-note">
        {{ readableError(ctx.sourceTextError.value) }}
      </p>
      <template v-else-if="ctx.sourceText.value">
        <pre class="isp-viewer-text">{{ ctx.sourceText.value.text }}</pre>
        <Button
          v-if="ctx.sourceText.value.nextOffset !== undefined"
          label="继续加载"
          size="small"
          text
          @click="ctx.showSource(selectedSource.id, ctx.sourceText.value.nextOffset)"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.isp {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.isp-add {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.isp-url {
  display: flex;
  gap: 0.5rem;
}

.isp-url-input {
  flex: 1;
  min-width: 0;
}

.isp-pick {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.isp-hint,
.isp-empty {
  font-size: 0.75rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.55);
  margin: 0;
}

.isp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  min-height: 0;
}

.isp-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 10px;
  border: 1px solid transparent;
}

.isp-row--referenced {
  background: rgba(99, 102, 241, 0.08);
}

.isp-row--selected {
  border-color: rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.14);
}

.isp-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  text-align: left;
}

.isp-icon {
  margin-top: 0.2rem;
  font-size: 0.85rem;
  color: rgba(165, 180, 252, 0.9);
}

.isp-name-wrap {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.isp-name,
.isp-url-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.isp-name {
  font-size: 0.85rem;
}

.isp-url-text {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.45);
}

.isp-error {
  font-size: 0.72rem;
  color: rgb(252, 165, 165);
}

.isp-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}

.isp-tags :deep(.p-tag) {
  font-size: 0.62rem;
  padding: 0.1rem 0.35rem;
}

.isp-viewer {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.isp-viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.isp-viewer-title {
  font-size: 0.8rem;
  font-weight: 600;
}

.isp-close {
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.isp-viewer-note {
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.isp-viewer-text {
  max-height: 22rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.78rem;
  line-height: 1.7;
  margin: 0;
  font-family: inherit;
}

@media (max-width: 480px) {
  .isp-row {
    flex-direction: column;
    align-items: stretch;
  }

  .isp-tags {
    justify-content: flex-start;
    padding-left: 1.4rem;
  }
}
</style>
