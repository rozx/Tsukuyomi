<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import SettingCard from './SettingCard.vue';
import CharacterEditDialog from 'src/components/dialogs/CharacterEditDialog.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { useBooksStore } from 'src/stores/books';
import type { Novel, Alias } from 'src/models/novel';
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

// 文件输入引用（用于导入 JSON）
const fileInputRef = ref<HTMLInputElement | null>(null);

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

// 导入角色设定
const handleImport = () => {
  fileInputRef.value?.click();
};

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const importedCharacters = await CharacterSettingService.importCharacterSettingsFromFile(file);

    if (importedCharacters.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '导入失败',
        detail: '文件中没有有效的角色设定数据',
        life: 3000,
      });
      target.value = '';
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: '没有选择书籍',
        life: 3000,
      });
      target.value = '';
      return;
    }

    // 导入角色设定：合并现有角色，如果名称相同则更新，否则添加
    let addedCount = 0;
    let updatedCount = 0;
    const addedCharIds: string[] = [];
    const updatedCharsSnapshot: Array<{
      id: string;
      name: string;
      sex?: 'male' | 'female' | 'other';
      translation: string;
      description?: string;
      speakingStyle?: string;
      aliases: Array<{ name: string; translation: string }>;
    }> = [];

    for (const importedChar of importedCharacters) {
      const existingChar = props.book.characterSettings?.find((c) => c.name === importedChar.name);

      if (existingChar) {
        // 保存更新前的状态用于撤销
        updatedCharsSnapshot.push({
          id: existingChar.id,
          name: existingChar.name,
          ...(existingChar.sex !== undefined ? { sex: existingChar.sex } : {}),
          translation: existingChar.translation.translation,
          ...(existingChar.description !== undefined
            ? { description: existingChar.description }
            : {}),
          ...(existingChar.speakingStyle !== undefined
            ? { speakingStyle: existingChar.speakingStyle }
            : {}),
          aliases: existingChar.aliases.map((a: Alias) => ({
            name: a.name,
            translation: a.translation.translation,
          })),
        });
        // 更新现有角色
        await CharacterSettingService.updateCharacterSetting(props.book.id, existingChar.id, {
          ...(importedChar.sex !== undefined ? { sex: importedChar.sex } : {}),
          translation: importedChar.translation.translation,
          ...(importedChar.description !== undefined
            ? { description: importedChar.description }
            : {}),
          ...(importedChar.speakingStyle !== undefined
            ? { speakingStyle: importedChar.speakingStyle }
            : {}),
          aliases: importedChar.aliases.map((a) => ({
            name: a.name,
            translation: a.translation.translation,
          })),
        });
        updatedCount++;
      } else {
        // 添加新角色
        const newChar = await CharacterSettingService.addCharacterSetting(props.book.id, {
          name: importedChar.name,
          ...(importedChar.sex !== undefined ? { sex: importedChar.sex } : {}),
          translation: importedChar.translation.translation,
          ...(importedChar.description !== undefined
            ? { description: importedChar.description }
            : {}),
          ...(importedChar.speakingStyle !== undefined
            ? { speakingStyle: importedChar.speakingStyle }
            : {}),
          aliases: importedChar.aliases.map((a) => ({
            name: a.name,
            translation: a.translation.translation,
          })),
        });
        addedCharIds.push(newChar.id);
        addedCount++;
      }
    }

    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: `已导入 ${importedCharacters.length} 个角色设定（新增 ${addedCount} 个，更新 ${updatedCount} 个）`,
      life: 3000,
      onRevert: async () => {
        if (!props.book) return;
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(props.book.id);
        if (!book) return;

        // 删除新添加的角色
        for (const id of addedCharIds) {
          await CharacterSettingService.deleteCharacterSetting(book.id, id);
        }

        // 恢复被更新的角色
        for (const snapshot of updatedCharsSnapshot) {
          await CharacterSettingService.updateCharacterSetting(book.id, snapshot.id, {
            name: snapshot.name,
            sex: snapshot.sex,
            translation: snapshot.translation,
            ...(snapshot.description !== undefined ? { description: snapshot.description } : {}),
            ...(snapshot.speakingStyle !== undefined
              ? { speakingStyle: snapshot.speakingStyle }
              : {}),
            aliases: snapshot.aliases,
          });
        }
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

  // 清空输入
  target.value = '';
};
</script>

<template>
  <div class="character-setting-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="p-6 border-b border-white/10">
      <h1 class="text-2xl font-semibold text-moon-100 mb-2">角色设置</h1>
      <p class="text-sm text-moon-100/70 mb-3">
        管理小说中的角色及其翻译和别名，这些设定会在翻译过程中被优先使用
      </p>
      <AppMessage
        severity="info"
        message="翻译、别名和描述字段留空时，AI 会在翻译过程中自动填充。AI 也会根据需要自动创建、更新或删除角色以优化翻译质量。"
        :closable="false"
      />
    </div>

    <!-- 操作栏 -->
    <div
      class="px-6 py-4 border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
    >
      <div class="toolbar-row">
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
            icon="pi pi-download"
            class="p-button-outlined"
            :disabled="!props.book?.characterSettings || props.book.characterSettings.length === 0"
            @click="handleExport"
          />
          <Button
            label="导入"
            icon="pi pi-upload"
            class="p-button-outlined"
            @click="handleImport"
          />
          <Button
            label="添加角色"
            icon="pi pi-plus"
            class="p-button-primary"
            @click="openAddDialog"
          />
        </div>
      </div>
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
          {{ searchQuery ? '未找到匹配的角色设定' : '暂无角色设定' }}
        </div>
      </div>
    </div>

    <!-- 角色编辑对话框 -->
    <CharacterEditDialog
      v-model:visible="showDialog"
      :character="selectedCharacter?._original || null"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 确认删除对话框 -->
    <Dialog
      v-model:visible="showDeleteConfirm"
      modal
      header="确认删除角色"
      :style="{ width: '25rem' }"
      :draggable="false"
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
    </Dialog>

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

<style scoped>
.character-setting-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 工具栏布局 */
.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: nowrap;
}

.toolbar-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* 移动端响应式：工具栏换行 */
@media (max-width: 640px) {
  .toolbar-row {
    flex-wrap: wrap;
  }

  .toolbar-search {
    flex: 1 1 100%;
  }

  .toolbar-search .search-input-group {
    flex: 1 1 100%;
    min-width: 0;
  }

  .toolbar-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }
}
</style>
