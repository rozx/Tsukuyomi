<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Chips from 'primevue/chips';
import type { Novel } from 'src/types/novel';
import CoverManagerDialog from './CoverManagerDialog.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode: 'add' | 'edit';
    book?: Novel | null;
  }>(),
  {
    book: null,
  }
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<Novel>];
  cancel: [];
}>();

const idPrefix = computed(() => props.mode === 'add' ? '' : 'edit');
const toast = useToastWithHistory();

// 表单数据
const formData = ref<Partial<Novel>>({
  title: '',
  alternateTitles: [],
  author: '',
  description: '',
  tags: [],
  webUrl: [],
});

// 封面管理对话框
const showCoverManager = ref(false);

// 表单验证错误
const formErrors = ref<Record<string, string>>({});

// 重置表单
const resetForm = () => {
  formData.value = {
    title: '',
    alternateTitles: [],
    author: '',
    description: '',
    tags: [],
    webUrl: [],
  };
  formErrors.value = {};
};

// 验证表单
const validateForm = (): boolean => {
  formErrors.value = {};

  if (!formData.value.title?.trim()) {
    formErrors.value.title = '书籍标题不能为空';
  }

  return Object.keys(formErrors.value).length === 0;
};

// 处理保存
const handleSave = () => {
  if (!validateForm()) {
    return;
  }
  emit('save', formData.value);
};

// 处理取消
const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};

// 复制封面 URL
const handleCopyUrl = async () => {
  if (!formData.value.cover?.url) return;

  try {
    await navigator.clipboard.writeText(formData.value.cover.url);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '封面 URL 已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    console.error('复制失败:', error);
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制 URL 到剪贴板',
      life: 3000,
    });
  }
};

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      if (props.mode === 'edit' && props.book) {
        // 编辑模式：填充现有数据
        const data: Partial<Novel> = {
          title: props.book.title,
          alternateTitles: props.book.alternateTitles ? [...props.book.alternateTitles] : [],
          author: props.book.author || '',
          description: props.book.description || '',
          tags: props.book.tags ? [...props.book.tags] : [],
          webUrl: props.book.webUrl ? [...props.book.webUrl] : [],
        };
        if (props.book.cover) {
          data.cover = { ...props.book.cover };
        }
        formData.value = data;
      } else {
        // 添加模式：重置表单
        resetForm();
      }
      formErrors.value = {};
    } else {
      // 关闭时重置
      resetForm();
    }
  },
  { immediate: true }
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="mode === 'add' ? '添加书籍' : '编辑书籍'"
    :modal="true"
    :style="{ width: '600px' }"
    :closable="true"
    class="book-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="space-y-5 py-2">
      <!-- 书籍标题 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-title`" class="block text-sm font-medium text-moon/90">书籍标题 *</label>
        <InputText
          :id="`${idPrefix}-title`"
          v-model="formData.title"
          placeholder="例如: 转生成为史莱姆"
          class="w-full"
          :class="{ 'p-invalid': formErrors.title }"
        />
        <small v-if="formErrors.title" class="p-error block mt-1">{{ formErrors.title }}</small>
      </div>

      <!-- 封面管理 -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-moon/90">封面</label>
        <div class="space-y-2">
          <div v-if="formData.cover?.url" class="relative w-24 aspect-[2/3] overflow-hidden rounded-lg bg-[rgba(255,255,255,0.05)] border border-white/10">
            <img
              :src="formData.cover.url"
              alt="封面预览"
              class="w-full h-full object-cover"
            />
          </div>
          <Button
            :label="formData.cover?.url ? '管理封面' : '上传封面'"
            :icon="formData.cover?.url ? 'pi pi-image' : 'pi pi-upload'"
            class="p-button-outlined"
            @click="showCoverManager = true"
          />
          <!-- 封面 URL 显示和复制 -->
          <div v-if="formData.cover?.url" class="space-y-1 p-2 bg-white/5 rounded border border-white/10">
            <div class="flex items-center justify-between gap-2">
              <span class="text-moon/60 text-xs">URL:</span>
              <Button
                icon="pi pi-copy"
                class="p-button-text p-button-sm"
                size="small"
                title="复制 URL"
                @click="handleCopyUrl"
              />
            </div>
            <a
              :href="formData.cover.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-moon/90 break-all text-xs text-primary hover:underline cursor-pointer"
            >
              {{ formData.cover.url }}
            </a>
          </div>
        </div>
        <small class="text-moon/60 text-xs block">点击按钮管理书籍封面图片</small>
      </div>

      <!-- 别名标题 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-alternateTitles`" class="block text-sm font-medium text-moon/90">别名标题</label>
        <Chips
          :id="`${idPrefix}-alternateTitles`"
          :model-value="formData.alternateTitles || []"
          @update:model-value="(value) => { formData.alternateTitles = value; }"
          placeholder="输入别名标题后按回车"
          class="w-full"
        />
        <small class="text-moon/60 block mt-1">输入别名标题后按回车键添加</small>
      </div>

      <!-- 作者 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-author`" class="block text-sm font-medium text-moon/90">作者</label>
        <InputText
          :id="`${idPrefix}-author`"
          v-model="formData.author"
          placeholder="例如: 伏瀬"
          class="w-full"
        />
      </div>

      <!-- 描述 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-description`" class="block text-sm font-medium text-moon/90">描述</label>
        <Textarea
          :id="`${idPrefix}-description`"
          v-model="formData.description"
          placeholder="输入书籍描述..."
          :rows="4"
          class="w-full"
          auto-resize
        />
      </div>

      <!-- 标签 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-tags`" class="block text-sm font-medium text-moon/90">标签</label>
        <Chips
          :id="`${idPrefix}-tags`"
          :model-value="formData.tags || []"
          @update:model-value="(value) => { formData.tags = value; }"
          placeholder="输入标签后按回车，或用逗号分隔输入多个标签"
          class="w-full"
          separator=","
        />
        <small class="text-moon/60 block mt-1">输入标签后按回车键添加，或用逗号分隔一次性添加多个标签</small>
      </div>

      <!-- 网络地址 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-webUrl`" class="block text-sm font-medium text-moon/90">网络地址</label>
        <Chips
          :id="`${idPrefix}-webUrl`"
          :model-value="formData.webUrl || []"
          @update:model-value="(value) => { formData.webUrl = value; }"
          placeholder="输入网络地址后按回车"
          class="w-full"
        />
        <!-- 显示可点击的 URL 列表 -->
        <div v-if="formData.webUrl && formData.webUrl.length > 0" class="space-y-1 mt-2">
          <div
            v-for="(url, index) in formData.webUrl"
            :key="index"
            class="flex items-center gap-2"
          >
            <a
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline text-sm break-all flex-1"
            >
              {{ url }}
            </a>
          </div>
        </div>
        <small class="text-moon/60 block mt-1">输入网络地址后按回车键添加</small>
      </div>
    </div>
    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text icon-button-hover"
        @click="handleCancel"
      />
      <Button label="保存" icon="pi pi-check" class="p-button-primary icon-button-hover" @click="handleSave" />
    </template>

    <!-- 封面管理对话框 -->
    <CoverManagerDialog
      v-model:visible="showCoverManager"
      :cover="formData.cover || null"
      @update:cover="(cover) => {
        if (cover) {
          formData.cover = cover;
        } else {
          delete formData.cover;
        }
      }"
    />
  </Dialog>
</template>

