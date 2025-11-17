<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cloneDeep } from 'lodash';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Chips from 'primevue/chips';
import type { Novel, Chapter } from 'src/types/novel';
import CoverManagerDialog from './CoverManagerDialog.vue';
import NovelScraperDialog from './NovelScraperDialog.vue';
import { NovelScraperFactory } from 'src/services/scraper';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { formatCharCount, getChapterCharCount } from 'src/utils';

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

// 爬虫对话框
const showScraper = ref(false);
const scraperInitialUrl = ref<string>('');

// 打开爬虫对话框（可选预设 URL）
const openScraper = (url?: string) => {
  scraperInitialUrl.value = url || '';
  showScraper.value = true;
};

// 表单验证错误
const formErrors = ref<Record<string, string>>({});

// 展开的卷 ID 集合（用于折叠/展开）
const expandedVolumes = ref<Set<string>>(new Set());

// 清除确认对话框
const showClearConfirm = ref(false);
const clearConfirmInput = ref('');

// 计算可用的卷和章节（从 formData 或 props.book 获取）
const availableVolumes = computed(() => {
  return formData.value.volumes || props.book?.volumes || [];
});

// 切换卷的展开/折叠状态
const toggleVolume = (volumeId: string) => {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId);
  } else {
    expandedVolumes.value.add(volumeId);
  }
};

// 使用工具函数计算和格式化
// getChapterCharCount 和 formatCharCount 已从 utils 导入

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
  expandedVolumes.value.clear();
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

// 检查 URL 是否可爬取
const isUrlScrapable = (url: string): boolean => {
  return NovelScraperFactory.isValidUrl(url);
};

// 处理应用爬取的数据
const handleApplyScrapedData = (novel: Novel) => {
  // 合并爬取的数据到表单
  // 只有当当前表单没有标题时才覆盖标题
  if (novel.title && !formData.value.title?.trim()) {
    formData.value.title = novel.title;
  }
  if (novel.author) {
    formData.value.author = novel.author;
  }
  if (novel.description) {
    formData.value.description = novel.description;
  }
  if (novel.tags && novel.tags.length > 0) {
    // 合并标签，去重
    const existingTags = formData.value.tags || [];
    formData.value.tags = [
      ...existingTags,
      ...novel.tags.filter((tag) => !existingTags.includes(tag)),
    ];
  }
  if (novel.webUrl && novel.webUrl.length > 0) {
    // 合并 URL，去重
    const existingUrls = formData.value.webUrl || [];
    formData.value.webUrl = [
      ...existingUrls,
      ...novel.webUrl.filter((url) => !existingUrls.includes(url)),
    ];
  }
  // 合并 volumes 和 chapters（如果存在）
  if (novel.volumes && novel.volumes.length > 0) {
    const existingVolumes = formData.value.volumes || [];

    if (existingVolumes.length === 0) {
      // 如果没有现有卷，直接使用新的
      formData.value.volumes = novel.volumes;
    } else {
      // 合并卷和章节
      const mergedVolumes = [...existingVolumes];

      novel.volumes.forEach((newVolume) => {
        // 查找同标题的现有卷
        const existingVolumeIndex = mergedVolumes.findIndex(
          (v) => v.title === newVolume.title
        );

        if (existingVolumeIndex >= 0) {
          // 卷已存在，合并章节
          const existingVolume = mergedVolumes[existingVolumeIndex];
          const existingChapters = existingVolume?.chapters || [];
          const newChapters = newVolume.chapters || [];

          if (existingChapters.length === 0) {
            // 如果现有卷没有章节，直接使用新章节
            if (existingVolume) {
              existingVolume.chapters = newChapters;
            }
          } else {
            // 合并章节：通过 webUrl 判断是否已存在
            const mergedChapters = [...existingChapters];

            newChapters.forEach((newChapter) => {
              if (newChapter.webUrl) {
                // 查找同 URL 的现有章节
                const existingChapterIndex = mergedChapters.findIndex(
                  (ch) => ch.webUrl === newChapter.webUrl
                );

                if (existingChapterIndex >= 0) {
                  // 章节已存在，更新内容
                  mergedChapters[existingChapterIndex] = {
                    ...mergedChapters[existingChapterIndex],
                    ...newChapter,
                    lastEdited: new Date(),
                  };
                } else {
                  // 章节不存在，添加新章节
                  mergedChapters.push(newChapter);
                }
              } else {
                // 没有 URL 的章节，直接添加
                mergedChapters.push(newChapter);
              }
            });

            if (existingVolume) {
              existingVolume.chapters = mergedChapters;
            }
          }
        } else {
          // 卷不存在，添加新卷
          mergedVolumes.push(newVolume);
        }
      });

      formData.value.volumes = mergedVolumes;
    }
  }

  showScraper.value = false;

  toast.add({
    severity: 'success',
    summary: '应用成功',
    detail: '小说信息已应用到表单，请检查后保存',
    life: 3000,
  });
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

// 清除所有卷和章节（需要输入书名确认）
const handleClearVolumes = () => {
  clearConfirmInput.value = '';
  showClearConfirm.value = true;
};

// 确认清除
const confirmClearVolumes = () => {
  const bookTitle = formData.value.title || props.book?.title || '';
  if (clearConfirmInput.value.trim() === bookTitle.trim()) {
    formData.value.volumes = [];
    expandedVolumes.value.clear();
    showClearConfirm.value = false;
    clearConfirmInput.value = '';
    toast.add({
      severity: 'success',
      summary: '已清除',
      detail: '所有卷和章节已被清除',
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: '书名不匹配',
      detail: '请输入正确的书名以确认清除操作',
      life: 3000,
    });
  }
};

// 取消清除
const cancelClearVolumes = () => {
  showClearConfirm.value = false;
  clearConfirmInput.value = '';
};

// 复制书名
const handleCopyBookTitle = async () => {
  const bookTitle = formData.value.title || props.book?.title || '';
  try {
    await navigator.clipboard.writeText(bookTitle);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '书名已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制书名到剪贴板',
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
        if (props.book.volumes) {
          // 深拷贝 volumes 数据，确保可以正确编辑
          data.volumes = cloneDeep(props.book.volumes);
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
      // 关闭清除确认对话框
      showClearConfirm.value = false;
      clearConfirmInput.value = '';
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
    :style="{ width: '900px' }"
    :closable="true"
    class="book-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="flex gap-6 py-2">
      <!-- 左侧表单区域 -->
      <div class="flex-1 space-y-5 min-w-0">
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
        <div class="flex items-center justify-between">
        <label :for="`${idPrefix}-webUrl`" class="block text-sm font-medium text-moon/90">网络地址</label>
          <Button
            label="从网站获取"
            icon="pi pi-download"
            class="p-button-text p-button-sm"
            size="small"
            @click="openScraper()"
          />
        </div>
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
            class="flex items-center gap-2 p-2 card-base"
          >
            <a
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline text-sm break-all flex-1"
            >
              {{ url }}
            </a>
            <Button
              v-if="isUrlScrapable(url)"
              icon="pi pi-download"
              class="p-button-text p-button-sm"
              size="small"
              title="爬取此 URL 的内容"
              @click="openScraper(url)"
            />
          </div>
        </div>
        <small class="text-moon/60 block mt-1">输入网络地址后按回车键添加，或点击按钮从支持的网站获取</small>
      </div>

      <!-- 卷和章节（只读） -->
      <div v-if="availableVolumes.length > 0" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium text-moon/90">卷和章节</label>
          <Button
            icon="pi pi-trash"
            label="清除全部"
            class="p-button-text p-button-danger p-button-sm"
            size="small"
            @click="handleClearVolumes"
          />
        </div>
        <div class="space-y-2 max-h-[300px] overflow-y-auto card-base p-3">
          <div
            v-for="volume in availableVolumes"
            :key="volume.id"
            class="space-y-2 border-b border-white/10 last:border-b-0 pb-2 last:pb-0"
          >
            <!-- 卷标题 -->
            <div
              class="flex items-center justify-between cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors"
              @click="toggleVolume(volume.id)"
            >
              <div class="flex items-center gap-2 flex-1">
                <i
                  :class="[
                    'pi text-xs transition-transform',
                    expandedVolumes.has(volume.id) ? 'pi-chevron-down' : 'pi-chevron-right',
                  ]"
                />
                <span class="font-semibold text-sm text-moon/90">
                  {{ volume.title || '未命名卷' }}
                </span>
                <span class="text-xs text-moon/60">
                  ({{ volume.chapters?.length || 0 }} 章)
                </span>
              </div>
            </div>

            <!-- 章节列表 -->
            <div
              v-if="expandedVolumes.has(volume.id) && volume.chapters && volume.chapters.length > 0"
              class="ml-6 space-y-1 mt-2"
            >
              <div
                v-for="chapter in volume.chapters"
                :key="chapter.id"
                class="flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors"
              >
                <i class="pi pi-file text-xs text-moon/60 mt-1 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="text-sm text-moon/80 line-clamp-2 flex-1">{{ chapter.title }}</div>
                    <span class="text-xs text-moon/60 flex-shrink-0">
                      {{ formatCharCount(getChapterCharCount(chapter)) }} 字
                    </span>
                  </div>
                  <div v-if="chapter.webUrl" class="mt-1">
                    <a
                      :href="chapter.webUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs text-primary hover:underline break-all"
                      @click.stop
                    >
                      {{ chapter.webUrl }}
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else-if="expandedVolumes.has(volume.id) && (!volume.chapters || volume.chapters.length === 0)"
              class="ml-6 text-xs text-moon/50 italic p-2"
            >
              暂无章节
            </div>
          </div>
        </div>
        <small class="text-moon/60 text-xs block">点击卷标题展开/折叠章节列表（只读）</small>
      </div>
      </div>

      <!-- 右侧封面管理区域 -->
      <div class="w-64 flex-shrink-0">
        <div class="space-y-2 sticky top-0">
          <label class="block text-sm font-medium text-moon/90">封面</label>
          <div class="space-y-2">
            <div v-if="formData.cover?.url" class="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-white/5 border border-white/10">
              <img
                :src="formData.cover.url"
                alt="封面预览"
                class="w-full h-full object-cover"
              />
            </div>
            <Button
              :label="formData.cover?.url ? '管理封面' : '上传封面'"
              :icon="formData.cover?.url ? 'pi pi-image' : 'pi pi-upload'"
              class="p-button-outlined w-full"
              @click="showCoverManager = true"
            />
            <!-- 封面 URL 显示和复制 -->
            <div v-if="formData.cover?.url" class="space-y-1 p-2 card-base">
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

    <!-- 小说爬虫对话框 -->
    <NovelScraperDialog
      v-model:visible="showScraper"
      :current-book="book || null"
      :initial-url="scraperInitialUrl"
      @apply="handleApplyScrapedData"
    />

    <!-- 清除确认对话框 -->
    <Dialog
      v-model:visible="showClearConfirm"
      header="确认清除所有卷和章节"
      :modal="true"
      :style="{ width: '500px' }"
      :closable="true"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          此操作将永久删除所有卷和章节数据，<strong class="text-red-400">无法撤销</strong>。
        </p>
        <p class="text-moon/90">
          请输入书籍名称以确认：
        </p>
        <div class="card-base p-3 flex items-center justify-between gap-2">
          <p class="text-primary font-medium break-all flex-1">{{ formData.title || props.book?.title }}</p>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm flex-shrink-0"
            size="small"
            title="复制书名"
            @click="handleCopyBookTitle"
          />
        </div>
        <InputText
          v-model="clearConfirmInput"
          placeholder="输入书籍名称"
          class="w-full"
          @keyup.enter="confirmClearVolumes"
        />
        <small class="text-moon/60 block">输入书名后按回车或点击"确认清除"按钮</small>
      </div>
      <template #footer>
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text"
          @click="cancelClearVolumes"
        />
        <Button
          label="确认清除"
          icon="pi pi-trash"
          class="p-button-danger"
          :disabled="clearConfirmInput.trim() !== (formData.title || props.book?.title || '').trim()"
          @click="confirmClearVolumes"
        />
      </template>
    </Dialog>
  </Dialog>
</template>
