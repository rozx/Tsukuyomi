<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
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
import type { Novel, Alias } from 'src/types/novel';
import {
  exportCharacterSettingsToJson,
  importCharacterSettingsFromFile,
} from 'src/utils';

const props = defineProps<{
  book: Novel | null;
}>();

const toast = useToastWithHistory();
const confirm = useConfirm();

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
    occurrences: char.occurrences.reduce((sum, occ) => sum + occ.count, 0),
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
      });
    } else {
      // 添加
      await CharacterSettingService.addCharacterSetting(props.book.id, data);
      toast.add({
        severity: 'success',
        summary: '添加成功',
        detail: `已添加角色 "${data.name}"`,
        life: 3000,
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

// 处理删除
const handleDelete = (character: (typeof characterSettings.value)[0]) => {
  if (!props.book) return;

  confirm.require({
    message: `确定要删除角色 "${character.name}" 吗？`,
    header: '确认删除',
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-text',
    acceptClass: 'p-button-danger',
    rejectLabel: '取消',
    acceptLabel: '删除',
    accept: () => {
      void (async () => {
        try {
          await CharacterSettingService.deleteCharacterSetting(props.book!.id, character.id);

          toast.add({
            severity: 'success',
            summary: '删除成功',
            detail: `已删除角色 "${character.name}"`,
            life: 3000,
          });
        } catch (error) {
          toast.add({
            severity: 'error',
            summary: '删除失败',
            detail: error instanceof Error ? error.message : '未知错误',
            life: 5000,
          });
        }
      })();
    },
  });
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
    exportCharacterSettingsToJson(props.book.characterSettings);
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
    const importedCharacters = await importCharacterSettingsFromFile(file);

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

    for (const importedChar of importedCharacters) {
      const existingChar = props.book.characterSettings?.find(
        (c) => c.name === importedChar.name,
      );

      if (existingChar) {
        // 更新现有角色
        await CharacterSettingService.updateCharacterSetting(
          props.book.id,
          existingChar.id,
          {
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
          },
        );
        updatedCount++;
      } else {
        // 添加新角色
        await CharacterSettingService.addCharacterSetting(props.book.id, {
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
        addedCount++;
      }
    }

    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: `已导入 ${importedCharacters.length} 个角色设定（新增 ${addedCount} 个，更新 ${updatedCount} 个）`,
      life: 3000,
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
        message="提示：翻译、别名和描述字段留空时，AI 在翻译章节时会自动添加、更新或删除这些内容"
        :closable="false"
      />
      <AppMessage
        severity="info"
        message="注意：AI 在翻译过程中会根据需要自动创建、更新或删除角色设置项目，以优化翻译质量"
        :closable="false"
      />
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 p-6 space-y-4 overflow-y-auto">
      <!-- 操作栏 -->
      <div class="flex items-center justify-between gap-3 flex-nowrap">
        <!-- 左侧：搜索栏 -->
        <div class="flex-1 flex items-center gap-3">
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
        <div class="flex items-center gap-2 flex-shrink-0">
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

      <!-- 角色列表 (卡片视图) -->
      <div
        class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 pb-4"
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
          :occurrences="char.occurrences"
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
    <ConfirmDialog />

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
</style>
