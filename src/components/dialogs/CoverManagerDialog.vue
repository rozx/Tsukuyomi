<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import CoverPreviewInfo from './CoverPreviewInfo.vue';
import CoverHistoryGrid from './CoverHistoryGrid.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { ImageUploadService } from 'src/services/image-upload-service';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { copyTextWithToast } from 'src/utils/clipboard';
import { formatFileSize } from 'src/utils/format';
import type { CoverImage } from 'src/models/novel';

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

// 上传按钮文案
const uploadLabel = computed(() => (uploading.value ? '上传中...' : '上传图片'));
// URL 添加按钮文案
const urlToggleButtonLabel = computed(() => (showUrlInput.value ? '取消' : '通过 URL 添加'));

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
  { immediate: true },
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
  },
);

// 新封面统一入库 + 选中 + 成功 toast
const registerAndSelectCover = async (
  newCover: CoverImage,
  toastContent: { summary: string; detail: string },
): Promise<void> => {
  // 必须 await，否则 allCovers 上的 find 可能看不到刚加的那一条（addCover 是异步 store mutation）
  await coverHistoryStore.addCover(newCover);
  const addedCover = allCovers.value.find((c) => c.url === newCover.url);
  if (addedCover) {
    selectedCoverId.value = addedCover.id;
  }
  emit('update:cover', newCover);
  toast.add({
    severity: 'success',
    ...toastContent,
    life: 2000,
  });
};

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

    await registerAndSelectCover(newCover, { summary: '上传成功', detail: '封面图片已上传' });

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
const handleAddByUrl = async () => {
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
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    toast.add({
      severity: 'error',
      summary: 'URL 格式错误',
      detail: '请输入有效的图片 URL 地址',
      life: 3000,
    });
    return;
  }

  // 协议白名单：仅放行 http/https，拦截 javascript:/data:/file: 等危险协议
  // （封面 URL 会绑定到 <a :href> / <img :src>，避免 XSS 与本地文件读取）
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    toast.add({
      severity: 'error',
      summary: 'URL 协议不支持',
      detail: '仅支持 http/https 图片地址',
      life: 3000,
    });
    return;
  }

  // 验证是否为图片 URL
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const isImageUrl =
    imageExtensions.some((ext) => url.toLowerCase().includes(ext)) ||
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

  await registerAndSelectCover(newCover, { summary: '添加成功', detail: '封面已通过 URL 添加' });
  urlInput.value = '';
  showUrlInput.value = false;
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
    void coverHistoryStore.removeCover(selectedCoverId.value);
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

// 格式化文件大小（复用 utils/format 的共享实现）

// 复制封面 URL
const handleCopyUrl = async () => {
  await copyTextWithToast(selectedCover.value?.url, toast, {
    successDetail: '封面 URL 已复制到剪贴板',
    errorDetail: '无法复制 URL 到剪贴板',
  });
};

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    header="管理封面"
    desktop-width="700px"
    eyebrow="COVER"
    dialog-class="cover-manager-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="space-y-4 py-2">
      <!-- 当前选中的封面预览 -->
      <CoverPreviewInfo
        v-if="selectedCover"
        :cover="selectedCover"
        :info="coverImageInfo"
        @copy-url="handleCopyUrl"
      />

      <!-- 封面历史记录 -->
      <CoverHistoryGrid
        :covers="allCovers"
        :selected-cover-id="selectedCoverId"
        @select="handleSelectCover"
      />

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
              :label="uploadLabel"
              icon="pi pi-upload"
              class="w-full"
              :loading="uploading"
              :disabled="uploading"
              @click="fileInputRef?.click()"
            />
          </div>
          <small class="text-moon/60 block"> 支持 JPG、PNG、GIF 等图片格式，最大 5MB </small>
        </div>

        <!-- 通过 URL 添加 -->
        <div class="space-y-2">
          <Button
            :label="urlToggleButtonLabel"
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
              <Button label="添加" icon="pi pi-check" class="flex-1" @click="handleAddByUrl" />
              <Button
                label="取消"
                icon="pi pi-times"
                class="flex-1 p-button-text"
                @click="
                  showUrlInput = false;
                  urlInput = '';
                "
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
  </AdaptiveDialog>
</template>

<style scoped>
.cover-manager-dialog :deep(.p-dialog-content) {
  padding: 1.5rem;
}
</style>
