<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import SettingCardTranslations from './SettingCardTranslations.vue';
import SettingCardAliases from './SettingCardAliases.vue';

interface Props {
  title: string;
  description?: string | undefined;
  speakingStyle?: string | undefined;
  sex?: 'male' | 'female' | 'other' | undefined;
  translations?: string | string[] | undefined;
  aliases?: string[] | undefined;
  showCheckbox?: boolean;
  checked?: boolean;
  itemId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showCheckbox: false,
  checked: false,
});

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'check', checked: boolean, itemId?: string): void;
}>();

// 计算头像显示的首字符
const avatarText = computed(() => {
  if (!props.title) return '?';
  // 获取第一个字符，如果是中文则直接使用，如果是英文则使用首字母大写
  const firstChar = props.title[0];
  if (!firstChar) return '?';
  return firstChar.toUpperCase();
});

// 根据性别计算头像背景颜色
const avatarBgClass = computed(() => {
  if (props.sex === 'male') {
    return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
  } else if (props.sex === 'female') {
    return 'bg-pink-500/20 border-pink-500/40 text-pink-300';
  } else if (props.sex === 'other') {
    return 'bg-purple-500/20 border-purple-500/40 text-purple-300';
  }
  // 未定义性别时使用灰色（术语卡片不显示头像）
  return 'bg-gray-500/20 border-gray-500/40 text-gray-300';
});

// 判断是否为角色卡片（有性别或别名）
const isCharacterCard = computed(() => {
  return props.sex !== undefined || props.aliases !== undefined;
});

// 性别相关展示文案/图标/标题：把模板内的多重三元收敛为 computed
const sexLabel = computed(() =>
  props.sex === 'male' ? '男性' : props.sex === 'female' ? '女性' : props.sex === 'other' ? '其他/未知' : '',
);
const sexIconClass = computed(() =>
  props.sex === 'male'
    ? 'pi pi-mars text-blue-400 text-sm'
    : props.sex === 'female'
      ? 'pi pi-venus text-pink-400 text-sm'
      : props.sex === 'other'
        ? 'pi pi-user text-purple-400 text-sm'
        : '',
);
const isRingVisible = computed(() => props.showCheckbox && props.checked);
</script>

<template>
  <div
    class="group relative flex flex-col h-full rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors overflow-hidden w-full max-w-full"
    :class="{ 'ring-2 ring-primary/50': isRingVisible }"
  >
    <!-- 头部：复选框、头像、名称与操作 -->
    <div class="flex justify-between items-start mb-3 gap-3">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <!-- 复选框（批量操作模式） -->
        <Checkbox
          v-if="showCheckbox"
          :model-value="checked"
          :binary="true"
          @update:model-value="(val) => emit('check', val, itemId)"
          @click.stop
        />
        <!-- 头像（仅角色卡片显示） -->
        <div
          v-if="isCharacterCard"
          :class="[
            'flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center font-semibold text-lg',
            avatarBgClass,
          ]"
          :title="sexLabel"
        >
          {{ avatarText }}
        </div>
        <div class="flex-1 min-w-0 pr-10 max-w-full">
          <div class="flex items-center min-w-0 w-full">
            <div class="flex-1 min-w-0 mr-2 max-w-full overflow-hidden">
              <h3 class="text-lg font-medium text-moon-100 line-clamp-2 break-words w-full" :title="title">
                {{ title }}
              </h3>
            </div>
            <div v-if="sexIconClass" class="flex-shrink-0 flex items-center">
              <i :class="sexIconClass" :title="sexLabel" />
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="!showCheckbox"
        class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-black/50 rounded backdrop-blur-sm p-1 z-10"
      >
        <Button
          icon="pi pi-pencil"
          class="p-button-text p-button-sm !w-8 !h-8 !text-white/80 hover:!text-white"
          @click.stop="$emit('edit')"
        />
        <Button
          icon="pi pi-trash"
          class="p-button-text p-button-sm p-button-danger !w-8 !h-8"
          @click.stop="$emit('delete')"
        />
      </div>
    </div>

    <!-- 描述 -->
    <div v-if="description" class="mb-4 w-full">
      <p 
        class="text-sm text-moon-100/70 break-words overflow-hidden" 
        :title="description"
        style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;"
      >
        {{ description }}
      </p>
    </div>
    <div v-else class="mb-4 text-sm text-moon-100/30 italic">暂无描述</div>

    <!-- 说话口吻 (仅 Character) -->
    <div v-if="speakingStyle" class="mb-4">
      <span class="text-xs text-moon-100/50 block mb-1.5">说话口吻</span>
      <p 
        class="text-sm text-moon-100/70 break-words overflow-hidden" 
        :title="speakingStyle"
        style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;"
      >
        {{ speakingStyle }}
      </p>
    </div>

    <!-- 翻译 -->
    <SettingCardTranslations :translations="translations" />

    <!-- 别名 (仅 Character) -->
    <SettingCardAliases :aliases="aliases" />

  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

