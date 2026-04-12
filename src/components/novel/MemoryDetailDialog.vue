<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ScrollPanel from 'primevue/scrollpanel';
import type { Memory } from 'src/models/memory';
import { EmbeddingQueue } from 'src/services/embedding-queue';
import { MemoryService } from 'src/services/memory-service';
import { MODEL_VERSION } from 'src/services/embedding-service';

interface Props {
  visible: boolean;
  memory: Memory | null;
  bookId: string;
  initialEditMode?: boolean;
}

const props = defineProps<Props>();

const confirm = useConfirm();
const toast = useToast();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  save: [memoryId: string, summary: string, content: string];
  delete: [memory: Memory];
}>();


// 编辑状态
const isEditing = ref(false);
const editedSummary = ref('');
const editedContent = ref('');

// 嵌入状态
const embeddingStatus = computed<'ready' | 'pending' | 'stale'>(() => {
  if (!props.memory) return 'pending';
  const { embedding, embeddingModel } = props.memory;
  if (!embedding || embedding.length === 0) return 'pending';
  if (!embeddingModel || embeddingModel !== MODEL_VERSION) return 'stale';
  return 'ready';
});

const embeddingStatusLabel = computed(() => {
  switch (embeddingStatus.value) {
    case 'ready':
      return '已向量化';
    case 'stale':
      return '向量版本过期';
    case 'pending':
    default:
      return '待向量化';
  }
});

const canManualEmbed = computed(() => embeddingStatus.value !== 'ready');

// 格式化日期时间
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 格式化相对时间
function formatRelativeTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return formatDateTime(timestamp);
}

// 处理关闭
function handleClose() {
  // 如果有未保存的更改，询问是否保存
  if (isEditing.value && hasUnsavedChanges.value) {
    confirm.require({
      message: '有未保存的更改，是否保存？',
      header: '确认',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '保存',
      rejectLabel: '放弃更改',
      accept: () => {
        handleSave();
        emit('update:visible', false);
      },
      reject: () => {
        handleCancel();
        emit('update:visible', false);
      },
    });
    return;
  }
  emit('update:visible', false);
}

// 开始编辑
function startEditing() {
  if (props.memory) {
    editedSummary.value = props.memory.summary;
    editedContent.value = props.memory.content;
    isEditing.value = true;
  }
}

// 取消编辑
function handleCancel() {
  isEditing.value = false;
  if (props.memory) {
    editedSummary.value = props.memory.summary;
    editedContent.value = props.memory.content;
  }
}

// 是否有未保存的更改
const hasUnsavedChanges = computed(() => {
  if (!props.memory) return false;
  return (
    editedSummary.value !== props.memory.summary || editedContent.value !== props.memory.content
  );
});

// 保存编辑
function handleSave() {
  if (props.memory && hasUnsavedChanges.value) {
    emit('save', props.memory.id, editedSummary.value, editedContent.value);
  }
  isEditing.value = false;
}

// 处理删除
function handleDelete() {
  if (props.memory) {
    emit('delete', props.memory);
  }
}

const isEmbedding = ref(false);

function handleManualEmbed() {
  if (!props.memory) return;
  isEmbedding.value = true;
  EmbeddingQueue.enqueue(props.memory.id);
  toast.add({
    severity: 'info',
    summary: '已加入嵌入队列',
    detail: '向量生成完成后将自动更新',
    life: 2000,
  });
}

// 复制内容到剪贴板
async function copyContent() {
  const contentToCopy = isEditing.value ? editedContent.value : props.memory?.content;
  if (!contentToCopy) return;

  try {
    await navigator.clipboard.writeText(contentToCopy);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '内容已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    console.error('复制失败:', error);
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制内容到剪贴板',
      life: 3000,
    });
  }
}

// 监听对话框打开，重置编辑状态
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      isEditing.value = props.initialEditMode ?? false;
      isEmbedding.value = false;
      if (props.memory) {
        editedSummary.value = props.memory.summary;
        editedContent.value = props.memory.content;
      }
    }
  },
);

// 监听 memory prop 变化（保存后父组件更新 detailMemory 时触发）,
// 非编辑状态下同步最新内容到本地编辑字段
watch(
  () => props.memory,
  (newMemory) => {
    if (newMemory && props.visible && !isEditing.value) {
      editedSummary.value = newMemory.summary;
      editedContent.value = newMemory.content;
    }
  },
);

// 监听 memory-changed 事件，嵌入完成后刷新对话框内的 embedding 状态
const unsubscribeMemoryChange = MemoryService.addMemoryChangeListener((event) => {
  if (!props.visible || !props.memory) return;
  const detail = event.detail;
  if (detail.action !== 'embedding-updated') return;
  if (detail.memoryId !== props.memory.id) return;
  isEmbedding.value = false;
});

// 嵌入队列出错时也重置 loading 状态
const unsubscribeQueueError = EmbeddingQueue.addEventListener('error', () => {
  isEmbedding.value = false;
});

onUnmounted(() => {
  unsubscribeMemoryChange();
  unsubscribeQueueError();
});
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="handleClose"
    :modal="true"
    :closable="true"
    :dismissable-mask="true"
    class="memory-detail-dialog"
    :style="{ width: '800px', maxWidth: '95vw' }"
    :pt="{
      root: { class: 'bg-surface-900 border border-white/10' },
      header: { class: 'border-b border-white/10 p-4' },
      content: { class: 'p-0' },
      footer: { class: 'border-t border-white/10 p-4' },
    }"
  >
    <template #header v-if="memory">
      <div class="flex items-center gap-3 min-w-0 overflow-hidden">
        <i class="pi pi-bookmark text-primary-400 text-xl shrink-0"></i>
        <h3 v-if="!isEditing" class="text-lg font-medium text-moon-100 m-0 truncate min-w-0">
          {{ memory.summary }}
        </h3>
        <span v-else class="text-lg font-medium text-moon-100/70 truncate">编辑记忆</span>
      </div>
    </template>

    <div v-if="memory" class="p-4 space-y-6">
      <!-- 摘要 -->
      <div>
        <h4 class="text-sm font-medium text-moon-100/70 mb-3 flex items-center gap-2">
          <i class="pi pi-tag"></i>
          摘要
        </h4>
        <!-- 只读模式 -->
        <div v-if="!isEditing" class="bg-white/5 rounded-lg p-3 border border-white/10">
          <p class="text-moon-100/90 m-0">{{ memory.summary }}</p>
        </div>
        <!-- 编辑模式 -->
        <InputText v-else v-model="editedSummary" placeholder="输入摘要..." class="w-full" />
      </div>

      <!-- 内容 -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-moon-100/70 flex items-center gap-2 m-0">
            <i class="pi pi-file"></i>
            内容
          </h4>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm"
            label="复制"
            @click="copyContent"
          />
        </div>
        <!-- 只读模式 -->
        <ScrollPanel v-if="!isEditing" class="w-full" style="max-height: 300px">
          <div class="bg-white/5 rounded-lg p-4 border border-white/10">
            <pre
              class="text-moon-100/80 m-0 whitespace-pre-wrap font-sans text-sm leading-relaxed"
              >{{ memory.content }}</pre
            >
          </div>
        </ScrollPanel>
        <!-- 编辑模式 -->
        <Textarea
          v-else
          v-model="editedContent"
          rows="10"
          placeholder="输入内容..."
          class="w-full"
        />
      </div>

      <!-- 元信息 -->
      <div class="pt-4 border-t border-white/5">
        <h4 class="text-sm font-medium text-moon-100/70 mb-3 flex items-center gap-2">
          <i class="pi pi-info-circle"></i>
          元信息
        </h4>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-moon-100/50">创建时间：</span>
            <span class="text-moon-100/70">{{ formatDateTime(memory.createdAt) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-moon-100/50">最后访问：</span>
            <span class="text-moon-100/70">{{ formatRelativeTime(memory.lastAccessedAt) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-moon-100/50">ID：</span>
            <span class="text-moon-100/30 font-mono">{{ memory.id }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-moon-100/50">向量状态：</span>
            <span class="text-moon-100/70">{{ embeddingStatusLabel }}</span>
          </div>
          <div v-if="memory.embeddingModel" class="flex items-center gap-2 col-span-2">
            <span class="text-moon-100/50">嵌入模型：</span>
            <span class="text-moon-100/50 font-mono text-xs">{{ memory.embeddingModel }}</span>
          </div>
        </div>
        <div v-if="canManualEmbed" class="mt-3">
          <Button
            icon="pi pi-refresh"
            label="为此记忆生成向量"
            class="p-button-outlined p-button-sm"
            :loading="isEmbedding"
            @click="handleManualEmbed"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2 mt-6">
        <template v-if="!isEditing">
          <Button
            label="删除"
            icon="pi pi-trash"
            class="p-button-danger p-button-text"
            @click="handleDelete"
          />
          <Button label="编辑" icon="pi pi-pencil" class="p-button-text" @click="startEditing" />
          <Button label="关闭" icon="pi pi-times" class="p-button-secondary" @click="handleClose" />
        </template>
        <template v-else>
          <Button label="取消" icon="pi pi-times" class="p-button-text" @click="handleCancel" />
          <Button
            label="保存"
            icon="pi pi-check"
            class="p-button-primary"
            :disabled="!editedContent.trim()"
            @click="handleSave"
          />
        </template>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.memory-detail-dialog :deep(.p-dialog-header) {
  background: rgba(255, 255, 255, 0.02);
}

.memory-detail-dialog :deep(.p-dialog-content) {
  background: transparent;
}

.memory-detail-dialog :deep(.p-dialog-footer) {
  background: rgba(255, 255, 255, 0.02);
}

.memory-detail-dialog :deep(.p-scrollpanel-wrapper) {
  border-radius: 0.5rem;
}

.memory-detail-dialog :deep(.p-scrollpanel-content) {
  padding: 0;
}
</style>
