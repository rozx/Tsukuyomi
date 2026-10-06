<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Slider from 'primevue/slider';
import type { SliderSlideEndEvent } from 'primevue/slider';
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useSettingsStore } from 'src/stores/settings';
import { EmbeddingService } from 'src/services/embedding-service';
import { EmbeddingQueue } from 'src/services/embedding-queue';
import type { EmbeddingStatus, EmbeddingProgressEvent } from 'src/services/embedding-service';
import { MODEL_ID } from 'src/services/embedding-service';
import { isMobileDevice } from 'src/utils/platform';
import { useI18n } from 'vue-i18n';

const settingsStore = useSettingsStore();
const { t } = useI18n();

const memoryInjection = computed(() => settingsStore.settings.memoryInjection);
const enableLocalEmbedding = ref(false);
const charBudget = ref(2000);
const enableSemantic = ref(true);
const minScoreThreshold = ref(0.38);

const isMobile = computed(() => isMobileDevice());
/** 手机端强制禁用 — 与 `utils/local-embedding` 的判定保持一致 */
const effectiveEnableLocalEmbedding = computed(() => !isMobile.value && enableLocalEmbedding.value);

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
    idle: t('settingsUi.embedding.statusIdle'),
    loading: t('settingsUi.embedding.statusLoading'),
    ready: t('settingsUi.embedding.statusReady'),
    failed: t('settingsUi.embedding.statusFailed'),
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
  // 手机端强制禁用:拦截任何 update,防止通过 Gist 同步悄悄同步到移动端。
  if (isMobile.value) return;
  enableLocalEmbedding.value = value;
  await settingsStore.updateSettings({ enableLocalEmbedding: value });

  // 开启后自动触发 warmup:
  // - 浏览器 Cache Storage 里已缓存过 → 秒 ready(无网络)
  // - 从未下载过 → 进度条亮起开始下 ~190 MiB
  // 两种情况 UI 都有明确反馈,不需要用户再手动按"下载模型"。
  // 关闭时不动已加载的 pipeline — EmbeddingQueue 的 gate 自会让它闲置,
  // 用户再次开启也不用重新加载。
  if (value) {
    if (embeddingStatus.value === 'idle' || embeddingStatus.value === 'failed') {
      void handleDownload();
    }
    // 踢一下队列:之前 mid-run 被关闭保留下来的 pending 在这里自动继续。
    // 如果 pipeline 还在加载,run() 内部会等 init 就绪再消费。
    EmbeddingQueue.tryResume();
  }
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
      lastError.value = detail.error?.message ?? t('settingsUi.common.unknownError');
    }),
  );
});

onUnmounted(() => {
  unsubscribers.forEach((unsub) => unsub());
});

// 以下 computed 把模板里的 ?: / && 收进脚本侧，并把三态按钮折叠成单个绑定
const toggleCardClass = computed(() =>
  effectiveEnableLocalEmbedding.value
    ? 'bg-primary-500/5 border-primary-500/30'
    : 'bg-moon/5 border-moon/10',
);
const enableLabelClass = computed(() => (isMobile.value ? 'text-moon/50' : 'text-moon/90'));
const enableDescClass = computed(() => (isMobile.value ? 'text-moon/50' : 'text-moon/70'));
const showProgressBar = computed(
  () => embeddingStatus.value === 'loading' && downloadProgress.value != null,
);
const progressValue = computed(() => downloadProgress.value ?? 0);
const showError = computed(() => !!lastError.value && embeddingStatus.value === 'failed');
const statusAction = computed<{
  label: string;
  icon: string;
  severity: 'secondary' | 'warn';
  text: boolean;
  handler: () => void;
} | null>(() => {
  switch (embeddingStatus.value) {
    case 'idle':
      return {
        label: t('settingsUi.embedding.download'),
        icon: 'pi pi-download',
        severity: 'secondary',
        text: false,
        handler: handleDownload,
      };
    case 'failed':
      return {
        label: t('settingsUi.embedding.retry'),
        icon: 'pi pi-refresh',
        severity: 'warn',
        text: false,
        handler: handleRetry,
      };
    case 'ready':
      return {
        label: t('settingsUi.embedding.reload'),
        icon: 'pi pi-refresh',
        severity: 'secondary',
        text: true,
        handler: handleRetry,
      };
    default:
      return null;
  }
});
const semanticLabelClass = computed(() =>
  effectiveEnableLocalEmbedding.value ? 'text-moon/80' : 'text-moon/40',
);
const semanticDescClass = computed(() =>
  effectiveEnableLocalEmbedding.value ? 'text-moon/60' : 'text-moon/40',
);
const semanticDescription = computed(() => {
  if (effectiveEnableLocalEmbedding.value) return t('settingsUi.embedding.semanticOn');
  if (isMobile.value) return t('settingsUi.embedding.semanticMobile');
  return t('settingsUi.embedding.semanticNeedsEmbedding');
});
</script>

<template>
  <div class="p-4 space-y-5">
    <!-- 本地嵌入总开关 -->
    <div class="p-3 rounded-lg border space-y-2" :class="toggleCardClass">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <label class="text-sm font-medium block" :class="enableLabelClass">
            {{ t('settingsUi.embedding.enable') }}
          </label>
          <p class="text-xs mt-0.5" :class="enableDescClass">
            <template v-if="isMobile">
              <span class="pi pi-mobile mr-1"></span>
              {{ t('settingsUi.embedding.mobileHint') }}
            </template>
            <template v-else>
              {{ t('settingsUi.embedding.desktopHint') }}
            </template>
          </p>
        </div>
        <ToggleSwitch
          :model-value="effectiveEnableLocalEmbedding"
          :disabled="isMobile"
          @update:model-value="updateEnableLocalEmbedding($event as boolean)"
        />
      </div>
    </div>

    <!-- 嵌入模型 -->
    <div v-if="effectiveEnableLocalEmbedding" class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">
          {{ t('settingsUi.embedding.modelTitle') }}
        </h3>
        <p class="text-xs text-moon/70">
          {{ t('settingsUi.embedding.modelDescription') }}
        </p>
      </div>

      <div class="p-3 bg-moon/5 rounded-lg border border-moon/10 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span :class="[statusIcon, statusClass]"></span>
            <span class="text-xs text-moon/80">{{ statusLabel }}</span>
          </div>
          <Button
            v-if="statusAction"
            :label="statusAction.label"
            :icon="statusAction.icon"
            size="small"
            :severity="statusAction.severity"
            :text="statusAction.text"
            @click="statusAction.handler"
          />
        </div>

        <div v-if="showProgressBar">
          <ProgressBar :value="progressValue" :show-value="true" class="h-2" />
          <p v-if="downloadFile" class="text-xs text-moon/50 mt-1 truncate">{{ downloadFile }}</p>
        </div>

        <p v-if="showError" class="text-xs text-red-400">
          {{ lastError }}
        </p>

        <p class="text-xs text-moon/60">
          <span class="pi pi-info-circle mr-1"></span>
          {{ MODEL_ID }}
          {{ t('settingsUi.embedding.modelSize') }}
        </p>
      </div>
    </div>

    <!-- 记忆注入 -->
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">
          {{ t('settingsUi.embedding.memoryTitle') }}
        </h3>
        <p class="text-xs text-moon/70">
          {{ t('settingsUi.embedding.memoryDescription') }}
        </p>
      </div>

      <div class="space-y-4">
        <!-- 字符预算 -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs text-moon/80">{{ t('settingsUi.embedding.charBudget') }}</label>
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
            <label class="text-xs text-moon/80">{{ t('settingsUi.embedding.minScore') }}</label>
            <span class="text-xs text-moon/60 tabular-nums">{{
              minScoreThreshold.toFixed(2)
            }}</span>
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
            <span>{{ t('settingsUi.embedding.minScoreAll') }}</span>
            <span>0.5</span>
          </div>
        </div>

        <!-- 语义信号开关 -->
        <div class="flex items-center justify-between pt-1">
          <div class="pr-3">
            <label class="text-xs block" :class="semanticLabelClass">
              {{ t('settingsUi.embedding.semantic') }}
            </label>
            <p class="text-xs mt-0.5" :class="semanticDescClass">
              {{ semanticDescription }}
            </p>
          </div>
          <ToggleSwitch
            :model-value="enableSemantic"
            :disabled="!effectiveEnableLocalEmbedding"
            @update:model-value="updateEnableSemantic($event as boolean)"
          />
        </div>
      </div>

      <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
        <p class="text-xs text-moon/70">
          <span class="pi pi-info-circle mr-1"></span>
          {{ t('settingsUi.embedding.weights') }}
        </p>
      </div>
    </div>

    <!-- 章节嵌入 -->
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">
          {{ t('settingsUi.embedding.chapterTitle') }}
        </h3>
        <p class="text-xs text-moon/70">
          {{ t('settingsUi.embedding.chapterDescription') }}
        </p>
      </div>

      <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
        <p class="text-xs text-moon/70">
          <span class="pi pi-info-circle mr-1"></span>
          {{ t('settingsUi.embedding.chapterAuto') }}
          <strong class="text-moon/90">{{ t('settingsUi.embedding.vectorIndex') }}</strong>
          {{ t('settingsUi.embedding.chapterAutoSuffix') }}
        </p>
      </div>
    </div>
  </div>
</template>
