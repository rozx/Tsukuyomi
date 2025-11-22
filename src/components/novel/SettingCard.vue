<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';

interface Props {
  title: string;
  description?: string | undefined;
  sex?: 'male' | 'female' | 'other' | undefined;
  translations?: string | string[] | undefined;
  aliases?: string[] | undefined;
  occurrences?: number | undefined;
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
</script>

<template>
  <div
    class="group relative flex flex-col h-full rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
    :class="{ 'ring-2 ring-primary/50': showCheckbox && checked }"
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
          :title="sex === 'male' ? '男性' : sex === 'female' ? '女性' : sex === 'other' ? '其他/未知' : ''"
        >
          {{ avatarText }}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-medium text-moon-100 truncate flex items-center gap-2" :title="title">
            {{ title }}
            <i v-if="sex === 'male'" class="pi pi-mars text-blue-400 text-sm" title="男性"></i>
            <i v-else-if="sex === 'female'" class="pi pi-venus text-pink-400 text-sm" title="女性"></i>
            <i v-else-if="sex === 'other'" class="pi pi-user text-purple-400 text-sm" title="其他/未知"></i>
          </h3>
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
    <div v-if="description" class="mb-4">
      <p class="text-sm text-moon/70 line-clamp-2 break-words" :title="description">
        {{ description }}
      </p>
    </div>
    <div v-else class="mb-4 text-sm text-moon/30 italic">暂无描述</div>

    <!-- 翻译 -->
    <div class="mb-3">
      <span class="text-xs text-moon/50 block mb-1.5">翻译</span>
      <!-- 数组情况 (Character) -->
      <div v-if="Array.isArray(translations)" class="flex flex-wrap gap-1.5">
        <span
          v-for="(t, index) in translations"
          :key="index"
          class="px-2 py-0.5 rounded bg-primary/20 text-primary-200 text-xs border border-primary/10"
        >
          {{ t }}
        </span>
        <span v-if="translations.length === 0" class="text-moon/30 text-xs italic">无</span>
      </div>
      <!-- 字符串情况 (Term) -->
      <div v-else-if="translations">
        <p class="text-primary-200 text-sm break-words font-medium">{{ translations }}</p>
      </div>
      <div v-else class="text-moon/30 text-xs italic">无</div>
    </div>

    <!-- 别名 (仅 Character) -->
    <div v-if="aliases !== undefined" class="mb-auto">
      <span class="text-xs text-moon/50 block mb-1.5">别名</span>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="(alias, index) in aliases"
          :key="index"
          class="px-2 py-0.5 rounded bg-accent/20 text-accent-200 text-xs border border-accent/10"
        >
          {{ alias }}
        </span>
        <span v-if="aliases.length === 0" class="text-moon/30 text-xs italic">无</span>
      </div>
    </div>
    <div v-else class="mb-auto"></div>

    <!-- 底部信息 -->
    <div
      class="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-xs text-moon/50"
    >
      <span>出现次数: {{ occurrences || 0 }}</span>
    </div>
  </div>
</template>

