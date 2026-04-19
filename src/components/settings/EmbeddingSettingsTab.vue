<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Slider from 'primevue/slider';
import type { SliderSlideEndEvent } from 'primevue/slider';
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useSettingsStore } from 'src/stores/settings';
import { EmbeddingService } from 'src/services/embedding-service';
import type { EmbeddingStatus, EmbeddingProgressEvent } from 'src/services/embedding-service';
import { MODEL_ID } from 'src/services/embedding-service';

const settingsStore = useSettingsStore();

const memoryInjection = computed(() => settingsStore.settings.memoryInjection);
const enableLocalEmbedding = ref(false);
const charBudget = ref(2000);
const enableSemantic = ref(true);
const minScoreThreshold = ref(0.38);

const embeddingStatus = ref<EmbeddingStatus>(EmbeddingService.getStatus());
const downloadProgress = ref<number | null>(null);
const downloadFile = ref('');
const lastError = ref<string | null>(null);

const syncFormState = () => {
  enableLocalEmbedding.value = settingsStore.settings.enableLocalEmbedding === true;
  charBudget.value = memoryInjection.value?.charBudget ?? 2000;
  enableSemantic.value = memoryInjection.value?.enableSemantic ?? true;
  minScoreThreshold.value = memoryInjection.value?.minScoreThreshold ?? 0.38;
};

watch(memoryInjection, () => syncFormState(), { deep: true });

const statusLabel = computed(() => {
  const labels: Record<EmbeddingStatus, string> = {
    idle: '未加载',
    loading: '加载中…',
    ready: '已就绪',
    failed: '加载失败',
  };
  return labels[embeddingStatus.value];
});

const statusClass = computed(() => {
  const classes: Record<EmbeddingStatus, string> = {
    idle: 'text-moon/60',
    loading: 'text-blue-400',
    ready: 'text-green-400',
    failed: 'text-red-400',
  };
  return classes[embeddingStatus.value];
});

const statusIcon = computed(() => {
  const icons: Record<EmbeddingStatus, string> = {
    idle: 'pi pi-circle',
    loading: 'pi pi-spin pi-spinner',
    ready: 'pi pi-check-circle',
    failed: 'pi pi-times-circle',
  };
  return icons[embeddingStatus.value];
});

const updateCharBudget = async (event: SliderSlideEndEvent) => {
  const value = event.value as number;
  charBudget.value = value;
  await settingsStore.updateMemoryInjection({ charBudget: value });
};

const updateEnableSemantic = async (value: boolean) => {
  enableSemantic.value = value;
  await settingsStore.updateMemoryInjection({ enableSemantic: value });
};

const updateEnableLocalEmbedding = async (value: boolean) => {
  enableLocalEmbedding.value = value;
  await settingsStore.updateSettings({ enableLocalEmbedding: value });
  // 开启后 UI 自然会亮起"下载模型"按钮,用户点按才真正拉 ~340-465MB 权重 —
  // 避免 toggle 瞬间静默触发大下载把用户带宽吃光。
};

const updateMinScoreThreshold = async (event: SliderSlideEndEvent) => {
  const value = event.value as number;
  minScoreThreshold.value = value;
  await settingsStore.updateMemoryInjection({ minScoreThreshold: value });
};

const handleDownload = async () => {
  downloadProgress.value = 0;
  lastError.value = null;
  await EmbeddingService.warmup();
};

const handleRetry = async () => {
  downloadProgress.value = 0;
  lastError.value = null;
  await EmbeddingService.reload();
};

const unsubscribers: Array<() => void> = [];

onMounted(async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
  syncFormState();

  unsubscribers.push(
    EmbeddingService.addEventListener('status-changed', (e: CustomEvent) => {
      embeddingStatus.value = (e.detail as { status: EmbeddingStatus }).status;
      if (embeddingStatus.value !== 'loading') {
        downloadProgress.value = null;
        downloadFile.value = '';
      }
      if (embeddingStatus.value === 'ready') {
        void settingsStore.updateMemoryInjection({ embeddingModelCached: true });
      }
    }),
  );

  unsubscribers.push(
    EmbeddingService.addEventListener('progress', (e: CustomEvent) => {
      const detail = e.detail as EmbeddingProgressEvent;
      if (detail.aggregatePercent != null) {
        downloadProgress.value = detail.aggregatePercent;
      } else if (detail.progress != null) {
        downloadProgress.value = Math.round(detail.progress);
      }
      if (detail.file) {
        downloadFile.value = detail.file;
      }
    }),
  );

  unsubscribers.push(
    EmbeddingService.addEventListener('error', (e: CustomEvent) => {
      const detail = e.detail as { error?: Error };
      lastError.value = detail.error?.message ?? '未知错误';
    }),
  );
});

onUnmounted(() => {
  unsubscribers.forEach((unsub) => unsub());
});
</script>

<template>
  <div class="p-4 space-y-5">
    <!-- 本地嵌入总开关 -->
    <div
      class="p-3 rounded-lg border space-y-2"
      :class="
        enableLocalEmbedding
          ? 'bg-primary-500/5 border-primary-500/30'
          : 'bg-moon/5 border-moon/10'
      "
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <label class="text-sm font-medium text-moon/90 block">启用本地嵌入</label>
          <p class="text-xs text-moon/70 mt-0.5">
            启用后下载嵌入模型到浏览器,支持语义记忆检索与章节向量搜索;
            关闭时仅用关键词匹配,节省 ~340–465 MB 存储。
          </p>
        </div>
        <ToggleSwitch
          :model-value="enableLocalEmbedding"
          @update:model-value="updateEnableLocalEmbedding($event as boolean)"
        />
      </div>
    </div>

    <!-- 嵌入模型 -->
    <div v-if="enableLocalEmbedding" class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">嵌入模型</h3>
        <p class="text-xs text-moon/70">
          本地运行的嵌入模型,为下方记忆注入与章节嵌入提供向量
        </p>
      </div>

      <div class="p-3 bg-moon/5 rounded-lg border border-moon/10 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span :class="[statusIcon, statusClass]"></span>
            <span class="text-xs text-moon/80">{{ statusLabel }}</span>
          </div>
          <Button
            v-if="embeddingStatus === 'idle'"
            label="下载模型"
            icon="pi pi-download"
            size="small"
            severity="secondary"
            @click="handleDownload"
          />
          <Button
            v-else-if="embeddingStatus === 'failed'"
            label="重试"
            icon="pi pi-refresh"
            size="small"
            severity="warn"
            @click="handleRetry"
          />
          <Button
            v-else-if="embeddingStatus === 'ready'"
            label="重新加载"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            @click="handleRetry"
          />
        </div>

        <div v-if="embeddingStatus === 'loading' && downloadProgress != null">
          <ProgressBar :value="downloadProgress" :show-value="true" class="h-2" />
          <p v-if="downloadFile" class="text-xs text-moon/50 mt-1 truncate">{{ downloadFile }}</p>
        </div>

        <p v-if="lastError && embeddingStatus === 'failed'" class="text-xs text-red-400">
          {{ lastError }}
        </p>

        <p class="text-xs text-moon/60">
          <span class="pi pi-info-circle mr-1"></span>
          {{ MODEL_ID }}
          (WebGPU: q4f16 ~465 MB / 无 WebGPU 回落 WASM: int8 ~340 MB,首次使用需下载到浏览器缓存)
        </p>
      </div>
    </div>

    <!-- 记忆注入 -->
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">记忆注入</h3>
        <p class="text-xs text-moon/70">
          翻译时自动选择最相关的记忆作为上下文
        </p>
      </div>

      <div class="space-y-4">
        <!-- 字符预算 -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs text-moon/80">字符预算</label>
            <span class="text-xs text-moon/60 tabular-nums">{{ charBudget }}</span>
          </div>
          <Slider
            v-model="charBudget"
            :min="500"
            :max="5000"
            :step="100"
            class="w-full"
            @slideend="updateCharBudget($event)"
          />
          <div class="flex justify-between text-xs text-moon/40">
            <span>500</span>
            <span>5000</span>
          </div>
        </div>

        <!-- 最低分数阈值 -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs text-moon/80">最低相关度</label>
            <span class="text-xs text-moon/60 tabular-nums">{{ minScoreThreshold.toFixed(2) }}</span>
          </div>
          <Slider
            v-model="minScoreThreshold"
            :min="0"
            :max="0.5"
            :step="0.01"
            class="w-full"
            @slideend="updateMinScoreThreshold($event)"
          />
          <div class="flex justify-between text-xs text-moon/40">
            <span>0(全部注入)</span>
            <span>0.5</span>
          </div>
        </div>

        <!-- 语义信号开关 -->
        <div class="flex items-center justify-between pt-1">
          <div class="pr-3">
            <label
              class="text-xs block"
              :class="enableLocalEmbedding ? 'text-moon/80' : 'text-moon/40'"
            >
              启用语义信号
            </label>
            <p class="text-xs mt-0.5" :class="enableLocalEmbedding ? 'text-moon/60' : 'text-moon/40'">
              <template v-if="enableLocalEmbedding">
                关闭后记忆打分仅用关键词和时间衰减
              </template>
              <template v-else>
                需要先在上方开启"本地嵌入"总开关
              </template>
            </p>
          </div>
          <ToggleSwitch
            :model-value="enableSemantic"
            :disabled="!enableLocalEmbedding"
            @update:model-value="updateEnableSemantic($event as boolean)"
          />
        </div>
      </div>

      <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
        <p class="text-xs text-moon/70">
          <span class="pi pi-info-circle mr-1"></span>
          评分基于三信号(语义相似度 + 关键词匹配 + 时间衰减)。即使关闭语义信号,关键词与时间衰减仍会工作。
        </p>
      </div>
    </div>

    <!-- 章节嵌入 -->
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">章节嵌入</h3>
        <p class="text-xs text-moon/70">
          为每章生成多段向量,让 AI 按剧情/事件/人物语义找相关章节
        </p>
      </div>

      <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
        <p class="text-xs text-moon/70">
          <span class="pi pi-info-circle mr-1"></span>
          章节嵌入在后台自动运行,段落或译文变更后 60 秒防抖重算,无可配置项。
          要查看 / 回填 / 重算进度,请在书籍详情页顶部的
          <strong class="text-moon/90">向量索引</strong> popup 中操作。
        </p>
      </div>
    </div>
  </div>
</template>
