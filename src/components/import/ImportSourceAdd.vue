<script setup lang="ts">
/**
 * 添加来源：网址、文件（可拖入）或文件夹。只登记访问范围，不读取、不解析；
 * 月詠通过工具检查后才会读取内容。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const store = useImportWorkspaceStore();
const { t } = useI18n();

const url = ref('');
const dragging = ref(false);
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
const onDrop = (event: DragEvent) => {
  dragging.value = false;
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) void store.addFiles(files);
};
</script>

<template>
  <section
    class="ipl-card isa"
    :class="{ 'isa--dragging': dragging }"
    :aria-label="t('importUi.sourceAdd.title')"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-plus-circle" aria-hidden="true" />{{ t('importUi.sourceAdd.title') }}
      </h3>
    </div>
    <form class="isa-url" @submit.prevent="addUrl">
      <InputText
        v-model="url"
        :placeholder="t('importUi.sourceAdd.urlPlaceholder')"
        :aria-label="t('importUi.sourceAdd.url')"
        class="isa-url-input"
      />
      <Button
        type="submit"
        icon="pi pi-link"
        :label="t('importUi.sourceAdd.addUrl')"
        size="small"
        :disabled="!canAddUrl"
        :loading="adding"
      />
    </form>
    <div class="isa-drop">
      <i class="pi pi-cloud-upload isa-drop-icon" aria-hidden="true" />
      <span class="isa-drop-text">{{ t('importUi.sourceAdd.drop') }}</span>
      <div class="isa-pick">
        <Button
          icon="pi pi-file"
          :label="t('importUi.sourceAdd.chooseFiles')"
          size="small"
          outlined
          @click="fileInput?.click()"
        />
        <Button
          v-if="folderSupported"
          icon="pi pi-folder-open"
          :label="t('importUi.sourceAdd.chooseFolder')"
          size="small"
          outlined
          @click="folderInput?.click()"
        />
      </div>
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
    <p class="ipl-muted">
      {{ t('importUi.sourceAdd.hint') }}
      <template v-if="!folderSupported">{{ t('importUi.sourceAdd.noFolder') }}</template>
    </p>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.isa {
  transition:
    border-color 150ms ease,
    background 150ms ease;
}

.isa--dragging {
  border-color: rgba(129, 140, 248, 0.6);
  background: rgba(99, 102, 241, 0.1);
}

.isa-url {
  display: flex;
  gap: 0.5rem;
}

.isa-url-input {
  flex: 1;
  min-width: 0;
}

.isa-drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 0.75rem;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  text-align: center;
}

.isa-drop-icon {
  font-size: 1.1rem;
  color: rgba(165, 180, 252, 0.85);
}

.isa-drop-text {
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.65);
}

.isa-pick {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
