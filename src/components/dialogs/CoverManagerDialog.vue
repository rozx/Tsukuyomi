<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { ImageUploadService } from 'src/services/image-upload-service';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import type { CoverImage } from 'src/types/novel';

const props = defineProps<{
  visible: boolean;
  cover?: CoverImage | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:cover': [cover: CoverImage | null];
}>();

const toast = useToastWithHistory();
const coverHistoryStore = useCoverHistoryStore();
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const urlInput = ref('');
const showUrlInput = ref(false);
const selectedCoverId = ref<string | null>(null);
const coverImageInfo = ref<{ width: number; height: number; size?: number } | null>(null);

// 所有封面历史记录
const allCovers = computed(() => coverHistoryStore.allCovers);

// 当前选中的封面
const selectedCover = computed(() => {
  if (selectedCoverId.value) {
    return allCovers.value.find((c) => c.id === selectedCoverId.value) || null;
  }
  return props.cover || null;
});

// 加载图片信息（尺寸和大小）
const loadImageInfo = async (url: string) => {
  try {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    // 尝试获取文件大小（通过 HEAD 请求）
    let fileSize: number | undefined;
    try {
      const headResponse = await fetch(url, { method: 'HEAD' });
      const contentLength = headResponse.headers.get('content-length');
      if (contentLength) {
        fileSize = parseInt(contentLength, 10);
      }
    } catch {
      // 如果无法获取文件大小，忽略错误
    }

    coverImageInfo.value = {
      width: img.width,
      height: img.height,
      ...(fileSize && { size: fileSize }),
    };
  } catch (error) {
    console.warn('无法加载图片信息:', error);
    coverImageInfo.value = null;
  }
};

// 监听选中封面变化，加载图片信息
watch(
  () => selectedCover.value?.url,
  async (newUrl) => {
    if (newUrl) {
      await loadImageInfo(newUrl);
    } else {
      coverImageInfo.value = null;
    }
  },
  { immediate: true }
);

// 监听对话框打开，初始化选中状态
watch(
  () => props.visible,
  async (newVisible) => {
    if (newVisible) {
      // 如果当前有封面，尝试在历史记录中找到并选中
      if (props.cover?.url) {
        const existing = allCovers.value.find((c) => c.url === props.cover?.url);
        selectedCoverId.value = existing?.id || null;
      } else {
        selectedCoverId.value = null;
      }
      urlInput.value = '';
      showUrlInput.value = false;

      // 等待 nextTick 确保 selectedCover computed 已更新，然后加载图片信息
      await nextTick();
      if (selectedCover.value?.url) {
        await loadImageInfo(selectedCover.value.url);
      }
    } else {
      coverImageInfo.value = null;
    }
  }
);

// 上传封面图片
const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploading.value = true;

  try {
    // 使用图片上传服务上传图片
    const result = await ImageUploadService.uploadImage(file);

    const newCover: CoverImage = {
      url: result.url,
      ...(result.deleteUrl && { deleteUrl: result.deleteUrl }),
    };

    // 添加到历史记录
    coverHistoryStore.addCover(newCover);

    // 选中新上传的封面
    const addedCover = allCovers.value.find((c) => c.url === newCover.url);
    if (addedCover) {
      selectedCoverId.value = addedCover.id;
    }

    emit('update:cover', newCover);
    toast.add({
      severity: 'success',
      summary: '上传成功',
      detail: '封面图片已上传',
      life: 2000,
    });

    // 重置文件输入
    if (fileInputRef.value) {
      fileInputRef.value.value = '';
    }
  } catch (error) {
    console.error('上传封面失败:', error);
    toast.add({
      severity: 'error',
      summary: '上传失败',
      detail: error instanceof Error ? error.message : '上传封面图片时发生错误',
      life: 3000,
    });
  } finally {
    uploading.value = false;
  }
};

// 通过 URL 添加封面
const handleAddByUrl = () => {
  const url = urlInput.value.trim();
  if (!url) {
    toast.add({
      severity: 'warn',
      summary: '请输入 URL',
      detail: '请输入图片的 URL 地址',
      life: 2000,
    });
    return;
  }

  // 验证 URL 格式
  try {
    new URL(url);
  } catch {
    toast.add({
      severity: 'error',
      summary: 'URL 格式错误',
      detail: '请输入有效的图片 URL 地址',
      life: 3000,
    });
    return;
  }

  // 验证是否为图片 URL
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const isImageUrl = imageExtensions.some((ext) => url.toLowerCase().includes(ext)) ||
                     url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);

  if (!isImageUrl) {
    toast.add({
      severity: 'warn',
      summary: '可能不是图片',
      detail: 'URL 可能不是图片格式，请确认',
      life: 2000,
    });
  }

  const newCover: CoverImage = {
    url: url,
  };

  // 添加到历史记录
  coverHistoryStore.addCover(newCover);

  // 选中新添加的封面
  const addedCover = allCovers.value.find((c) => c.url === newCover.url);
  if (addedCover) {
    selectedCoverId.value = addedCover.id;
  }

  emit('update:cover', newCover);
  urlInput.value = '';
  showUrlInput.value = false;
  toast.add({
    severity: 'success',
    summary: '添加成功',
    detail: '封面已通过 URL 添加',
    life: 2000,
  });
};

// 选择封面
const handleSelectCover = (cover: CoverImage & { id: string }) => {
  selectedCoverId.value = cover.id;
  emit('update:cover', {
    url: cover.url,
    ...(cover.deleteUrl && { deleteUrl: cover.deleteUrl }),
  });
};

// 确认选择
const handleConfirm = () => {
  if (selectedCover.value) {
    emit('update:cover', {
      url: selectedCover.value.url,
      ...(selectedCover.value.deleteUrl && { deleteUrl: selectedCover.value.deleteUrl }),
    });
  }
  emit('update:visible', false);
};

// 删除封面
const handleDelete = async () => {
  if (!selectedCover.value) return;

  // 如果有删除 URL，尝试调用删除 API
  if (selectedCover.value.deleteUrl) {
    try {
      await ImageUploadService.deleteImage(selectedCover.value.deleteUrl);
    } catch (error) {
      // 即使删除失败，也继续移除本地引用
      console.warn('删除远程图片失败:', error);
    }
  }

  // 从历史记录中删除
  if (selectedCoverId.value) {
    coverHistoryStore.removeCover(selectedCoverId.value);
  }

  selectedCoverId.value = null;
  emit('update:cover', null);
  toast.add({
    severity: 'success',
    summary: '已删除',
    detail: '封面图片已删除',
    life: 2000,
  });
};

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

// 复制封面 URL
const handleCopyUrl = async () => {
  if (!selectedCover.value?.url) return;

  try {
    await navigator.clipboard.writeText(selectedCover.value.url);
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

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    header="管理封面"
    :modal="true"
    :style="{ width: '700px' }"
    :closable="true"
    class="cover-manager-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="space-y-4 py-2">
      <!-- 当前选中的封面预览 -->
      <div v-if="selectedCover" class="space-y-3">
        <div class="text-sm font-medium text-moon/90">当前选中封面</div>
        <div class="relative w-full aspect-[2/3] max-w-xs mx-auto overflow-hidden rounded-lg bg-white/5 border border-white/10">
          <img
            :src="selectedCover.url"
            alt="封面预览"
            class="w-full h-full object-cover"
            @error="(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }"
          />
        </div>
        <!-- 封面详细信息 -->
        <div class="space-y-2 p-3 bg-white/5 rounded-lg border border-white/10">
          <div class="space-y-1.5 text-xs">
            <div class="space-y-1">
              <div class="flex items-center justify-between gap-2">
                <span class="text-moon/60">URL:</span>
                <Button
                  icon="pi pi-copy"
                  class="p-button-text p-button-sm"
                  size="small"
                  title="复制 URL"
                  @click="handleCopyUrl"
                />
              </div>
              <a
                :href="selectedCover.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent-400 hover:text-accent-300 hover:underline break-all text-xs cursor-pointer transition-colors"
              >
                {{ selectedCover.url }}
              </a>
            </div>
            <div v-if="coverImageInfo" class="flex items-center justify-between gap-2">
              <span class="text-moon/60">尺寸:</span>
              <span class="text-moon/90">{{ coverImageInfo.width }} × {{ coverImageInfo.height }} px</span>
            </div>
            <div v-if="coverImageInfo?.size" class="flex items-center justify-between gap-2">
              <span class="text-moon/60">大小:</span>
              <span class="text-moon/90">{{ formatFileSize(coverImageInfo.size) }}</span>
            </div>
            <div v-if="coverImageInfo && !coverImageInfo.size" class="flex items-center justify-between gap-2">
              <span class="text-moon/60">大小:</span>
              <span class="text-moon/60 italic">无法获取</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 封面历史记录 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium text-moon/90">封面历史</div>
          <div class="text-xs text-moon/60">{{ allCovers.length }} 个封面</div>
        </div>
        <div v-if="allCovers.length > 0" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto p-2 border border-white/10 rounded-lg">
          <div
            v-for="cover in allCovers"
            :key="cover.id"
            :class="[
              'relative aspect-[2/3] overflow-hidden rounded-lg border-2 cursor-pointer transition-all group',
              selectedCoverId === cover.id
                ? 'border-primary ring-2 ring-primary/50'
                : 'border-white/10 hover:border-white/30 hover:ring-1 hover:ring-white/20'
            ]"
            @click="handleSelectCover(cover)"
          >
            <img
              :src="cover.url"
              alt="封面"
              class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              @error="(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }"
            />
            <div
              v-if="selectedCoverId === cover.id"
              class="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-sm"
            >
              <i class="pi pi-check-circle text-primary text-2xl drop-shadow-lg" />
            </div>
            <!-- 悬停时的选中提示 -->
            <div
              v-if="selectedCoverId !== cover.id"
              class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <i class="pi pi-check text-white text-lg" />
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-moon/60 text-sm">
          暂无封面历史记录
        </div>
      </div>

      <!-- 添加封面 -->
      <div class="space-y-3 border-t border-white/10 pt-3">
        <div class="text-sm font-medium text-moon/90">添加封面</div>

        <!-- 上传文件 -->
        <div class="space-y-2">
          <div class="relative">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              :disabled="uploading"
              @change="handleFileSelect"
            />
            <Button
              :label="uploading ? '上传中...' : '上传图片'"
              icon="pi pi-upload"
              class="w-full"
              :loading="uploading"
              :disabled="uploading"
              @click="fileInputRef?.click()"
            />
          </div>
          <small class="text-moon/60 block">
            支持 JPG、PNG、GIF 等图片格式，最大 5MB
          </small>
        </div>

        <!-- 通过 URL 添加 -->
        <div class="space-y-2">
          <Button
            :label="showUrlInput ? '取消' : '通过 URL 添加'"
            icon="pi pi-link"
            class="w-full p-button-outlined"
            @click="showUrlInput = !showUrlInput"
          />
          <div v-if="showUrlInput" class="space-y-2">
            <InputText
              v-model="urlInput"
              placeholder="输入图片 URL 地址"
              class="w-full"
              @keyup.enter="handleAddByUrl"
            />
            <div class="flex gap-2">
              <Button
                label="添加"
                icon="pi pi-check"
                class="flex-1"
                @click="handleAddByUrl"
              />
              <Button
                label="取消"
                icon="pi pi-times"
                class="flex-1 p-button-text"
                @click="showUrlInput = false; urlInput = ''"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 删除按钮 -->
      <div v-if="selectedCover" class="border-t border-white/10 pt-3">
        <Button
          label="删除当前封面"
          icon="pi pi-trash"
          class="p-button-danger w-full"
          :loading="uploading"
          @click="handleDelete"
        />
      </div>
    </div>
    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text icon-button-hover"
        @click="handleClose"
      />
      <Button
        label="确认"
        icon="pi pi-check"
        class="p-button-primary icon-button-hover"
        @click="handleConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.cover-manager-dialog :deep(.p-dialog-content) {
  padding: 1.5rem;
}
</style>

