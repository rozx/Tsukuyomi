<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { resolveAppLocale } from 'src/models/locale';
import Button from 'primevue/button';
import EntityDeleteConfirmDialog from 'src/components/dialogs/EntityDeleteConfirmDialog.vue';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import SettingCard from './SettingCard.vue';
import CharacterEditDialog from 'src/components/dialogs/CharacterEditDialog.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useFilePicker } from 'src/composables/dialogs/useFilePicker';
import { useToolbarExpand } from 'src/composables/useToolbarExpand';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { BookService } from 'src/services/book-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { hasDuplicateEntityNames } from 'src/services/localization/entity-identity';
import { useBooksStore } from 'src/stores/books';
import type { Novel, Alias, CharacterSetting } from 'src/models/novel';
import { cloneDeep } from 'lodash';
import co from 'co';
import { v4 } from 'uuid';

const props = defineProps<{
  book: Novel | null;
}>();

const { t, locale } = useI18n();
const hasAliasConflicts = computed(() =>
  (props.book?.characterSettings ?? []).some((character) =>
    character.aliases.some(
      (alias, index, aliases) =>
        alias.legacyConflict ||
        aliases.some((other, otherIndex) => otherIndex !== index && other.name === alias.name),
    ),
  ),
);
const hasNameConflicts = computed(() =>
  hasDuplicateEntityNames(props.book?.characterSettings ?? []),
);
const toast = useToastWithHistory();
const confirm = useConfirm();

// 删除相关状态
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const deletingCharacter = ref<{
  id: string;
  name: string;
  sex?: 'male' | 'female' | 'other' | undefined;
  description?: string | undefined;
  speakingStyle?: string | undefined;
  translations: string;
  aliases: string[];
  _original: any;
} | null>(null);

// 搜索关键词
const searchQuery = ref('');

// 工具栏展开状态（移动端）
const isToolbarExpanded = ref(false);

// 角色设定列表数据
const allCharacterSettings = computed(() => {
  if (!props.book?.characterSettings) return [];

  return props.book.characterSettings.map((char) => ({
    id: char.id,
    name: char.name,
    sex: char.sex,
    description: char.description,
    speakingStyle: char.speakingStyle,
    translations:
      getNameTranslation(char, props.book?.targetLanguage ?? 'zh-CN')?.translation ?? '',
    aliases: char.aliases.map((a: Alias) => a.name),
    // 保留原始对象引用以便需要时使用
    _original: char,
  }));
});

// 过滤后的角色设定列表
const characterSettings = computed(() => {
  if (!searchQuery.value.trim()) {
    return allCharacterSettings.value;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return allCharacterSettings.value.filter((char) => {
    const name = char.name.toLowerCase();
    const translation = char.translations.toLowerCase();
    const description = (char.description || '').toLowerCase();
    const speakingStyle = (char.speakingStyle || '').toLowerCase();
    const aliases = char.aliases.join(' ').toLowerCase();
    return (
      name.includes(query) ||
      translation.includes(query) ||
      description.includes(query) ||
      speakingStyle.includes(query) ||
      aliases.includes(query)
    );
  });
});

const showDialog = ref(false);
const selectedCharacter = ref<(typeof characterSettings.value)[0] | null>(null);
const isSaving = ref(false);

// 工具栏展开图标/标题、空状态文案、编辑对话框角色：把模板内联三元与 || 收敛为 computed
const { toolbarExpandIcon, toolbarExpandTitle } = useToolbarExpand(isToolbarExpanded);
const emptyStateText = computed(() =>
  searchQuery.value ? t('panelUi.noCharacterMatches') : t('panelUi.noCharacters'),
);
const editDialogCharacter = computed(() => selectedCharacter.value?._original ?? null);
const canExportCharacters = computed(
  () => !!props.book?.characterSettings && props.book.characterSettings.length > 0,
);

// 文件输入引用（用于导入 JSON）
const { fileInputRef, triggerFilePicker: handleImport, createFileSelectHandler } = useFilePicker();

// 打开添加对话框
const openAddDialog = () => {
  selectedCharacter.value = null;
  showDialog.value = true;
};

// 打开编辑对话框
const openEditDialog = (character: (typeof characterSettings.value)[0]) => {
  selectedCharacter.value = character;
  showDialog.value = true;
};

// 处理保存
const handleSave = async (data: {
  name: string;
  sex?: 'male' | 'female' | 'other' | undefined;
  translation: string;
  description: string;
  speakingStyle: string;
  aliases: Array<{ id?: string; name: string; translation: string }>;
}) => {
  if (!props.book) return;

  if (!data.name.trim()) {
    toast.add({
      severity: 'warn',
      summary: t('panelUi.validationFailed'),
      detail: t('panelUi.characterNameRequired'),
      life: 3000,
    });
    return;
  }

  isSaving.value = true;

  try {
    if (selectedCharacter.value) {
      // 更新
      const charId = selectedCharacter.value.id;
      const originalChar = props.book.characterSettings?.find((c) => c.id === charId);
      // 深拷贝保留原始数据用于撤销
      const previousCharData = originalChar ? cloneDeep(originalChar) : null;
      const restoreBookId = props.book.id;
      const restoreOperationId = v4();

      await CharacterSettingService.updateCharacterSetting(
        props.book.id,
        selectedCharacter.value.id,
        data,
      );
      toast.add({
        severity: 'success',
        summary: t('panelUi.updated'),
        detail: t('panelUi.characterUpdated', { name: data.name }),
        life: 3000,
        onRevert: async () => {
          if (previousCharData)
            await useBooksStore().restoreEntity(
              restoreBookId,
              'character',
              previousCharData,
              restoreOperationId,
            );
        },
      });
    } else {
      // 添加
      const newChar = await CharacterSettingService.addCharacterSetting(props.book.id, data);
      toast.add({
        severity: 'success',
        summary: t('panelUi.added'),
        detail: t('panelUi.characterAdded', { name: data.name }),
        life: 3000,
        onRevert: () => CharacterSettingService.deleteCharacterSetting(props.book!.id, newChar.id),
      });
    }
    showDialog.value = false;
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: selectedCharacter.value ? t('panelUi.updateFailed') : t('panelUi.addFailed'),
      detail: localizedErrorMessage(error, resolveAppLocale(locale.value), 'panelUi.unknownError'),
      life: 5000,
    });
  } finally {
    isSaving.value = false;
  }
};

// 打开删除确认对话框
const openDeleteConfirm = (character: (typeof characterSettings.value)[0]) => {
  if (!props.book) return;
  deletingCharacter.value = character;
  showDeleteConfirm.value = true;
};

// 确认删除角色
const confirmDeleteCharacter = async () => {
  if (!props.book || !deletingCharacter.value || isDeleting.value) return;

  const character = deletingCharacter.value;
  isDeleting.value = true;

  try {
    // 保存要删除的角色数据用于撤销
    const charToRestore = cloneDeep(character._original) as CharacterSetting;
    const restoreBookId = props.book.id;
    const restoreOperationId = v4();

    await CharacterSettingService.deleteCharacterSetting(props.book.id, character.id);

    toast.add({
      severity: 'success',
      summary: t('panelUi.deleted'),
      detail: t('panelUi.characterDeleted', { name: character.name }),
      life: 3000,
      onRevert: async () => {
        await useBooksStore().restoreEntity(
          restoreBookId,
          'character',
          charToRestore,
          restoreOperationId,
        );
      },
    });

    showDeleteConfirm.value = false;
    deletingCharacter.value = null;
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.deleteFailed'),
      detail: localizedErrorMessage(error, resolveAppLocale(locale.value), 'panelUi.unknownError'),
      life: 5000,
    });
  } finally {
    isDeleting.value = false;
  }
};

// 处理删除（保留兼容性，调用新的删除确认函数）
const handleDelete = (character: (typeof characterSettings.value)[0]) => {
  if (!props.book) return;
  openDeleteConfirm(character);
};

// 导出角色设定为 JSON
const handleExport = () => {
  if (!props.book?.characterSettings || props.book.characterSettings.length === 0) {
    toast.add({
      severity: 'warn',
      summary: t('panelUi.exportFailed'),
      detail: t('panelUi.noExportCharacters'),
      life: 3000,
    });
    return;
  }

  try {
    CharacterSettingService.exportCharacterSettingsToJson(props.book.characterSettings);
    toast.add({
      severity: 'success',
      summary: t('panelUi.exported'),
      detail: t('panelUi.exportedCharacters', { count: props.book.characterSettings.length }),
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.exportFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'panelUi.unknownCharacterExport',
      ),
      life: 5000,
    });
  }
};

// 导入角色的撤销快照（仅记录被更新条目的可恢复字段）
type UpdatedCharSnapshot = CharacterSetting;

interface CharsImportResult {
  revertOperationId: string;
  addedCount: number;
  updatedCount: number;
  addedCharIds: string[];
  updatedCharsSnapshot: UpdatedCharSnapshot[];
}

const executeCharsImport = async (
  bookId: string,
  importedCharacters: CharacterSetting[],
): Promise<CharsImportResult> => {
  const result = await BookService.importEntities(bookId, 'character', importedCharacters);
  await useBooksStore().refreshBookFromStorage(bookId);
  return {
    addedCount: result.addedIds.length,
    updatedCount: result.updatedBefore.length,
    addedCharIds: result.addedIds,
    updatedCharsSnapshot: result.updatedBefore,
    revertOperationId: v4(),
  };
};

// 撤销导入：删除新增条目，恢复被更新条目的快照字段
const revertCharsImport = async (bookId: string, result: CharsImportResult): Promise<void> => {
  for (const id of result.addedCharIds) {
    const book = useBooksStore().getBookById(bookId);
    if (!book) throw new Error('BOOK_MISSING');
    if (book.characterSettings?.some((item) => item.id === id))
      await CharacterSettingService.deleteCharacterSetting(bookId, id);
  }
  for (const snapshot of result.updatedCharsSnapshot) {
    await useBooksStore().restoreEntity(
      bookId,
      'character',
      snapshot,
      `${result.revertOperationId}:${snapshot.id}`,
    );
  }
};

// 处理文件选择
const handleFileSelect = createFileSelectHandler(async (file) => {
  try {
    const importedCharacters = await CharacterSettingService.importCharacterSettingsFromFile(file);

    if (importedCharacters.length === 0) {
      toast.add({
        severity: 'warn',
        summary: t('panelUi.importFailed'),
        detail: t('panelUi.noImportCharacters'),
        life: 3000,
      });
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: t('panelUi.importFailed'),
        detail: t('panelUi.noBook'),
        life: 3000,
      });
      return;
    }

    const result = await executeCharsImport(props.book.id, importedCharacters);

    // 与 TerminologyPanel 的导入成功 toast 结构高度相似（onRevert 前序步骤一致），
    // 但后续恢复更新逻辑各自维护不同字段集合，强行抽公共回调反而更复杂，保留两处实现。
    toast.add({
      severity: 'success',
      summary: t('panelUi.imported'),
      // fallow-ignore-next-line code-duplication
      detail: t('panelUi.importedCharacters', {
        count: importedCharacters.length,
        added: result.addedCount,
        updated: result.updatedCount,
      }),
      life: 3000,
      onRevert: async () => {
        if (!props.book) return;
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(props.book.id);
        if (!book) return;
        await revertCharsImport(book.id, result);
      },
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.importFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'panelUi.unknownCharacterImport',
      ),
      life: 5000,
    });
  }
});
</script>

<template>
  <div class="character-setting-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">{{ t('panelUi.characterTitle') }}</h1>
      <p class="panel-desc text-sm text-moon-100/70">{{ t('panelUi.characterDescription') }}</p>
    </div>

    <!-- 操作栏 -->
    <div
      class="panel-toolbar border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
      :class="{ 'toolbar-expanded': isToolbarExpanded }"
    >
      <!-- 移动端紧凑操作栏 -->
      <div class="toolbar-mobile-compact">
        <span class="text-sm text-moon/60">{{
          t('panelUi.characterCount', { count: characterSettings.length })
        }}</span>
        <Button
          :icon="toolbarExpandIcon"
          size="small"
          class="p-button-text"
          @click="isToolbarExpanded = !isToolbarExpanded"
          :title="toolbarExpandTitle"
        />
      </div>
      <!-- 可折叠内容（搜索 + 操作） -->
      <div class="toolbar-row toolbar-expandable">
        <!-- 左侧：搜索栏 -->
        <div class="toolbar-search">
          <InputGroup class="search-input-group min-w-0 flex-shrink">
            <InputGroupAddon>
              <i class="pi pi-search text-base" />
            </InputGroupAddon>
            <InputText
              v-model="searchQuery"
              :placeholder="t('panelUi.characterSearch')"
              class="search-input"
            />
            <InputGroupAddon v-if="searchQuery" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                @click="searchQuery = ''"
                :title="t('panelUi.clearSearch')"
              />
            </InputGroupAddon>
          </InputGroup>
        </div>

        <!-- 右侧：操作按钮 -->
        <div class="toolbar-actions">
          <Button
            :label="t('panelUi.export')"
            icon="pi pi-upload"
            size="small"
            class="p-button-outlined"
            :disabled="!canExportCharacters"
            @click="handleExport"
          />
          <Button
            :label="t('panelUi.import')"
            icon="pi pi-download"
            size="small"
            class="p-button-outlined"
            @click="handleImport"
          />
          <Button
            :label="t('panelUi.addCharacter')"
            icon="pi pi-plus"
            size="small"
            class="p-button-primary"
            @click="openAddDialog"
          />
        </div>
      </div>
      <AppMessage
        severity="info"
        class="panel-message toolbar-expandable"
        :message="t('panelUi.characterAiHint')"
        :closable="false"
      />
    </div>

    <AppMessage
      v-if="hasNameConflicts"
      severity="warn"
      :message="t('books.nameConflict')"
      :closable="false"
      class="m-4"
    />

    <AppMessage
      v-if="hasAliasConflicts"
      severity="warn"
      :message="t('books.aliasConflict')"
      :closable="false"
    />

    <!-- 内容区域 -->
    <div class="flex-1 p-6 overflow-y-auto">
      <!-- 角色列表 (卡片视图) -->
      <div
        class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 pb-4"
        style="grid-template-columns: repeat(auto-fill, minmax(300px, min(1fr, 500px)))"
      >
        <SettingCard
          v-for="char in characterSettings"
          :key="char.id"
          :title="char.name"
          :sex="char.sex"
          :description="char.description"
          :speaking-style="char.speakingStyle"
          :translations="char.translations"
          :aliases="char.aliases"
          @edit="openEditDialog(char)"
          @delete="handleDelete(char)"
        />

        <!-- 空状态 -->
        <div
          v-if="characterSettings.length === 0"
          class="col-span-full py-12 text-center text-moon-100/50 border border-dashed border-white/10 rounded-lg"
        >
          {{ emptyStateText }}
        </div>
      </div>
    </div>

    <!-- 角色编辑对话框 -->
    <CharacterEditDialog
      :target-language="book?.targetLanguage ?? 'zh-CN'"
      v-model:visible="showDialog"
      :character="editDialogCharacter"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 确认删除对话框 -->
    <EntityDeleteConfirmDialog
      v-model:visible="showDeleteConfirm"
      :name="deletingCharacter?.name ?? null"
      :loading="isDeleting"
      header-key="structureUi.confirmDeleteCharacter"
      question-key="structureUi.deleteCharacterQuestion"
      warning-key="structureUi.cannotUndo"
      @confirm="confirmDeleteCharacter"
    />

    <!-- 保留 ConfirmDialog 用于其他可能的确认操作 -->
    <ConfirmDialog group="character" />

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </div>
</template>

<!-- 标题区样式（五个设置面板共享），详见 panel-header.css -->
<style scoped src="./panel-header.css"></style>
<!-- 工具栏外壳通用样式（三个设置面板共享），详见 setting-panel.css -->
<style scoped src="./setting-panel.css"></style>

<style scoped>
.character-setting-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 本面板独有：搜索区容器 */
.toolbar-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

/* 移动端响应式（本面板独有部分） */
@media (max-width: 640px) {
  .toolbar-search {
    flex: 1 1 100%;
  }

  .toolbar-search .search-input-group {
    flex: 1 1 100%;
    min-width: 0;
  }

  /* 次要按钮只显示图标 */
  .toolbar-actions :deep(.p-button-outlined .p-button-label) {
    display: none;
  }
}
</style>
