<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
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
import { useBooksStore } from 'src/stores/books';
import type { Novel, Alias, CharacterSetting } from 'src/models/novel';
import { cloneDeep } from 'lodash';
import co from 'co';

const props = defineProps<{
  book: Novel | null;
}>();

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
    translations: char.translation.translation,
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
  searchQuery.value ? '未找到匹配的角色设定' : '暂无角色设定',
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
  aliases: Array<{ name: string; translation: string }>;
}) => {
  if (!props.book) return;

  if (!data.name.trim()) {
    toast.add({
      severity: 'warn',
      summary: '校验失败',
      detail: '角色名称不能为空',
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

      await CharacterSettingService.updateCharacterSetting(
        props.book.id,
        selectedCharacter.value.id,
        data,
      );
      toast.add({
        severity: 'success',
        summary: '更新成功',
        detail: `已更新角色 "${data.name}"`,
        life: 3000,
        onRevert: async () => {
          if (previousCharData && props.book) {
            await CharacterSettingService.updateCharacterSetting(
              props.book.id,
              previousCharData.id,
              {
                name: previousCharData.name,
                ...(previousCharData.sex !== undefined && { sex: previousCharData.sex }),
                translation: previousCharData.translation.translation,
                ...(previousCharData.description !== undefined && {
                  description: previousCharData.description,
                }),
                ...(previousCharData.speakingStyle !== undefined && {
                  speakingStyle: previousCharData.speakingStyle,
                }),
                aliases: previousCharData.aliases.map((a: Alias) => ({
                  name: a.name,
                  translation: a.translation.translation,
                })),
              },
            );
          }
        },
      });
    } else {
      // 添加
      const newChar = await CharacterSettingService.addCharacterSetting(props.book.id, data);
      toast.add({
        severity: 'success',
        summary: '添加成功',
        detail: `已添加角色 "${data.name}"`,
        life: 3000,
        onRevert: () => CharacterSettingService.deleteCharacterSetting(props.book!.id, newChar.id),
      });
    }
    showDialog.value = false;
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: selectedCharacter.value ? '更新失败' : '添加失败',
      detail: error instanceof Error ? error.message : '未知错误',
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
    const charToRestore = cloneDeep(character._original);

    await CharacterSettingService.deleteCharacterSetting(props.book.id, character.id);

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已删除角色 "${character.name}"`,
      life: 3000,
      onRevert: async () => {
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(props.book!.id);
        if (book) {
          const current = book.characterSettings || [];
          // 检查是否存在（避免重复）
          if (!current.some((c) => c.id === charToRestore.id)) {
            await booksStore.updateBook(book.id, {
              characterSettings: [...current, charToRestore],
              lastEdited: new Date(),
            });
          }
        }
      },
    });

    showDeleteConfirm.value = false;
    deletingCharacter.value = null;
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: error instanceof Error ? error.message : '未知错误',
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
      summary: '导出失败',
      detail: '当前没有可导出的角色设定',
      life: 3000,
    });
    return;
  }

  try {
    CharacterSettingService.exportCharacterSettingsToJson(props.book.characterSettings);
    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: `已成功导出 ${props.book.characterSettings.length} 个角色设定`,
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出角色设定时发生未知错误',
      life: 5000,
    });
  }
};

/**
 * 导入场景下把外部角色条目规整为 addCharacterSetting / updateCharacterSetting 所需的扁平载荷。
 * add 分支会在外层加 `name` 字段，update 分支直接传该对象。
 */
type ImportedCharLike = {
  sex?: 'male' | 'female' | 'other' | undefined;
  translation: { translation: string };
  description?: string | undefined;
  speakingStyle?: string | undefined;
  aliases: Array<{ name: string; translation: { translation: string } }>;
};
const buildImportedCharPayload = (importedChar: ImportedCharLike) => ({
  ...(importedChar.sex !== undefined ? { sex: importedChar.sex } : {}),
  translation: importedChar.translation.translation,
  ...(importedChar.description !== undefined ? { description: importedChar.description } : {}),
  ...(importedChar.speakingStyle !== undefined
    ? { speakingStyle: importedChar.speakingStyle }
    : {}),
  aliases: importedChar.aliases.map((a) => ({
    name: a.name,
    translation: a.translation.translation,
  })),
});

// 导入角色的撤销快照（仅记录被更新条目的可恢复字段）
type UpdatedCharSnapshot = {
  id: string;
  name: string;
  sex?: 'male' | 'female' | 'other';
  translation: string;
  description?: string;
  speakingStyle?: string;
  aliases: Array<{ name: string; translation: string }>;
};

interface CharsImportResult {
  addedCount: number;
  updatedCount: number;
  addedCharIds: string[];
  updatedCharsSnapshot: UpdatedCharSnapshot[];
};

const buildUpdatedCharSnapshot = (existingChar: CharacterSetting): UpdatedCharSnapshot => ({
  id: existingChar.id,
  name: existingChar.name,
  ...(existingChar.sex !== undefined ? { sex: existingChar.sex } : {}),
  translation: existingChar.translation.translation,
  ...(existingChar.description !== undefined ? { description: existingChar.description } : {}),
  ...(existingChar.speakingStyle !== undefined
    ? { speakingStyle: existingChar.speakingStyle }
    : {}),
  aliases: existingChar.aliases.map((a: Alias) => ({
    name: a.name,
    translation: a.translation.translation,
  })),
});

// 执行导入：名称相同的更新，否则新增。返回新增/更新计数与撤销所需的快照
const executeCharsImport = async (
  bookId: string,
  importedCharacters: CharacterSetting[],
  existingCharacters: CharacterSetting[] | undefined,
): Promise<CharsImportResult> => {
  let addedCount = 0;
  let updatedCount = 0;
  const addedCharIds: string[] = [];
  const updatedCharsSnapshot: UpdatedCharSnapshot[] = [];

  for (const importedChar of importedCharacters) {
    const existingChar = existingCharacters?.find((c) => c.name === importedChar.name);
    if (existingChar) {
      updatedCharsSnapshot.push(buildUpdatedCharSnapshot(existingChar));
      // 更新现有角色：buildImportedCharPayload 不含 name，保持与原始实现一致
      await CharacterSettingService.updateCharacterSetting(
        bookId,
        existingChar.id,
        buildImportedCharPayload(importedChar),
      );
      updatedCount++;
    } else {
      const newChar = await CharacterSettingService.addCharacterSetting(bookId, {
        name: importedChar.name,
        ...buildImportedCharPayload(importedChar),
      });
      addedCharIds.push(newChar.id);
      addedCount++;
    }
  }

  return { addedCount, updatedCount, addedCharIds, updatedCharsSnapshot };
};

// 撤销导入：删除新增条目，恢复被更新条目的快照字段
const revertCharsImport = async (bookId: string, result: CharsImportResult): Promise<void> => {
  for (const id of result.addedCharIds) {
    await CharacterSettingService.deleteCharacterSetting(bookId, id);
  }
  for (const snapshot of result.updatedCharsSnapshot) {
    await CharacterSettingService.updateCharacterSetting(bookId, snapshot.id, {
      name: snapshot.name,
      ...(snapshot.sex !== undefined ? { sex: snapshot.sex } : {}),
      translation: snapshot.translation,
      ...(snapshot.description !== undefined ? { description: snapshot.description } : {}),
      ...(snapshot.speakingStyle !== undefined ? { speakingStyle: snapshot.speakingStyle } : {}),
      aliases: snapshot.aliases,
    });
  }
};

// 处理文件选择
const handleFileSelect = createFileSelectHandler(async (file) => {
  try {
    const importedCharacters = await CharacterSettingService.importCharacterSettingsFromFile(file);

    if (importedCharacters.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '导入失败',
        detail: '文件中没有有效的角色设定数据',
        life: 3000,
      });
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: '没有选择书籍',
        life: 3000,
      });
      return;
    }

    const result = await executeCharsImport(
      props.book.id,
      importedCharacters,
      props.book.characterSettings,
    );

    // 与 TerminologyPanel 的导入成功 toast 结构高度相似（onRevert 前序步骤一致），
    // 但后续恢复更新逻辑各自维护不同字段集合，强行抽公共回调反而更复杂，保留两处实现。
    toast.add({
      severity: 'success',
      summary: '导入成功',
      // fallow-ignore-next-line code-duplication
      detail: `已导入 ${importedCharacters.length} 个角色设定（新增 ${result.addedCount} 个，更新 ${result.updatedCount} 个）`,
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
      summary: '导入失败',
      detail: error instanceof Error ? error.message : '导入角色设定时发生未知错误',
      life: 5000,
    });
  }
});
</script>

<template>
  <div class="character-setting-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">角色设置</h1>
      <p class="panel-desc text-sm text-moon-100/70">
        管理小说中的角色及其翻译和别名，这些设定会在翻译过程中被优先使用
      </p>
    </div>

    <!-- 操作栏 -->
    <div
      class="panel-toolbar border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
      :class="{ 'toolbar-expanded': isToolbarExpanded }"
    >
      <!-- 移动端紧凑操作栏 -->
      <div class="toolbar-mobile-compact">
        <span class="text-sm text-moon/60">{{ characterSettings.length }} 位角色</span>
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
              placeholder="搜索角色名称、翻译、描述、说话风格或别名..."
              class="search-input"
            />
            <InputGroupAddon v-if="searchQuery" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                @click="searchQuery = ''"
                title="清除搜索"
              />
            </InputGroupAddon>
          </InputGroup>
        </div>

        <!-- 右侧：操作按钮 -->
        <div class="toolbar-actions">
          <Button
            label="导出"
            icon="pi pi-upload"
            size="small"
            class="p-button-outlined"
            :disabled="!canExportCharacters"
            @click="handleExport"
          />
          <Button
            label="导入"
            icon="pi pi-download"
            size="small"
            class="p-button-outlined"
            @click="handleImport"
          />
          <Button
            label="添加角色"
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
        message="翻译、别名和描述字段留空时，AI 会在翻译过程中自动填充。AI 也会根据需要自动创建、更新或删除角色以优化翻译质量。"
        :closable="false"
      />
    </div>

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
      v-model:visible="showDialog"
      :character="editDialogCharacter"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 确认删除对话框 -->
    <AdaptiveDialog
      v-model:visible="showDeleteConfirm"
      header="确认删除角色"
      desktop-width="25rem"
      eyebrow="DELETE"
      sheet-min-height="auto"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除角色 <strong>"{{ deletingCharacter?.name }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isDeleting"
          @click="showDeleteConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          :loading="isDeleting"
          :disabled="isDeleting"
          @click="confirmDeleteCharacter"
        />
      </template>
    </AdaptiveDialog>

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
