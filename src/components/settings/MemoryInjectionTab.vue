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
const charBudget = ref(2000);
const enableSemantic = ref(true);
const minScoreThreshold = ref(0.38);

const embeddingStatus = ref<EmbeddingStatus>(EmbeddingService.getStatus());
const downloadProgress = ref<number | null>(null);
const downloadFile = ref('');
const lastError = ref<string | null>(null);

const syncFormState = () => {
  charBudget.value = memoryInjection.value?.charBudget ?? 2000;
  enableSemantic.value = memoryInjection.value?.enableSemantic ?? true;
  minScoreThreshold.value = memoryInjection.value?.minScoreThreshold ?? 0.38;
};

// store 被外部修改（如同步下载覆盖）时，将最新值同步到本地 ref
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
      // 首次成功就绪时，持久化"已缓存"标记，供下次启动时自动预热使用
      if (embeddingStatus.value === 'ready') {
        void settingsStore.updateMemoryInjection({ embeddingModelCached: true });
      }
    }),
  );

  unsubscribers.push(
    EmbeddingService.addEventListener('progress', (e: CustomEvent) => {
      const detail = e.detail as EmbeddingProgressEvent;
      // 优先使用 service 侧维护的聚合进度（跨多个模型文件单调递增）；
      // 旧的 `progress` 字段是每文件局部值，切文件时会回跳到 0，不适合做进度条。
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
  <div class="p-4 space-y-6">
    <!-- 注入策略 -->
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-3">注入策略</h3>
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
            <span>0（全部注入）</span>
            <span>0.5</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 语义检索开关(记忆打分) -->
    <div class="border-t border-moon/10 pt-5">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="text-sm font-medium text-moon/90">记忆的语义检索</h3>
          <p class="text-xs text-moon/50 mt-0.5">
            关闭后记忆打分只靠关键词和时间衰减
          </p>
        </div>
        <ToggleSwitch
          :model-value="enableSemantic"
          @update:model-value="updateEnableSemantic($event as boolean)"
        />
      </div>
    </div>

    <!-- 本地嵌入模型(共享:记忆 + 章节) -->
    <div class="border-t border-moon/10 pt-5">
      <div class="mb-3">
        <h3 class="text-sm font-medium text-moon/90">本地嵌入模型</h3>
        <p class="text-xs text-moon/50 mt-0.5">
          同时用于<strong class="text-moon/70">记忆注入打分</strong>与
          <strong class="text-moon/70">章节语义查询</strong>(AI 工具 query_chapter)
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

        <p class="text-xs text-moon/40">{{ MODEL_ID }} (~195 MB,本地运行)</p>
      </div>
    </div>

    <!-- 说明 -->
    <div class="p-3 bg-moon/5 rounded-lg border border-moon/10 space-y-1.5">
      <p class="text-xs text-moon/60">
        <span class="pi pi-info-circle mr-1"></span>
        <strong>记忆注入</strong>:翻译时自动选择最相关的记忆作为上下文。评分基于语义相似度、关键词匹配和时间衰减三个信号,即使未启用语义检索仍可工作。
      </p>
      <p class="text-xs text-moon/60">
        <span class="pi pi-info-circle mr-1"></span>
        <strong>章节语义查询</strong>:AI 可通过 query_chapter 按剧情/事件/人物描述找相关章节。该功能始终使用本地嵌入模型,不受上方"记忆的语义检索"开关影响。
      </p>
    </div>
  </div>
</template>
