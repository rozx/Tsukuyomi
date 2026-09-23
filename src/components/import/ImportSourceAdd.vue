<script setup lang="ts">
/**
 * 添加来源：网址、文件或文件夹。只登记访问范围，不读取、不解析；
 * 月詠通过工具检查后才会读取内容。
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const store = useImportWorkspaceStore();

const url = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const folderSupported =
  typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;
const adding = computed(() => store.pendingAction === 'add-source');
const canAddUrl = computed(() => Boolean(url.value.trim()));

const addUrl = async () => {
  if (!canAddUrl.value) return;
  await store.addUrl(url.value);
  if (!store.error) url.value = '';
};

const takeFiles = (event: Event): File[] => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  return files;
};
const onFiles = (event: Event) => void store.addFiles(takeFiles(event));
const onFolder = (event: Event) =>
  void store.addDirectory(
    takeFiles(event).map((file) => ({ file, path: file.webkitRelativePath || file.name })),
  );
</script>

<template>
  <div class="isa">
    <form class="isa-url" @submit.prevent="addUrl">
      <InputText
        v-model="url"
        placeholder="小说目录或章节网址（http/https）"
        aria-label="来源网址"
        class="isa-url-input"
      />
      <Button
        type="submit"
        label="添加网址"
        size="small"
        :disabled="!canAddUrl"
        :loading="adding"
      />
    </form>
    <div class="isa-pick">
      <Button
        icon="pi pi-file"
        label="选择文件"
        size="small"
        outlined
        @click="fileInput?.click()"
      />
      <Button
        v-if="folderSupported"
        icon="pi pi-folder-open"
        label="选择文件夹"
        size="small"
        outlined
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
    <p class="isa-hint">
      添加来源只登记访问范围，不会立即读取；月詠检查后才会读取内容。支持 TXT、Markdown、HTML、EPUB
      等格式。需要登录或验证的网站请改为提供文件。
    </p>
    <p v-if="!folderSupported" class="isa-hint">当前环境不支持选择文件夹，可以一次选择多个文件。</p>
  </div>
</template>

<style scoped>
.isa {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.isa-url {
  display: flex;
  gap: 0.5rem;
}

.isa-url-input {
  flex: 1;
  min-width: 0;
}

.isa-pick {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.isa-hint {
  font-size: 0.75rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.55);
  margin: 0;
}
</style>
