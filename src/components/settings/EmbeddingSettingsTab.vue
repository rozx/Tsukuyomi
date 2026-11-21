<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Slider from 'primevue/slider';
import type { SliderSlideEndEvent } from 'primevue/slider';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useSettingsStore } from 'src/stores/settings';
import { EmbeddingService } from 'src/services/embedding-service';
import { EmbeddingQueue } from 'src/services/embedding-queue';
import type {
  EmbeddingBackend,
  EmbeddingStatus,
  EmbeddingProgressEvent,
} from 'src/services/embedding-service';
import { MODEL_ID, MODEL_VERSION } from 'src/services/embedding-service';
import { CHAPTER_MODEL_VERSION } from 'src/services/chapter-embedding-service';
import { isMobileDevice } from 'src/utils/platform';
import { useI18n } from 'vue-i18n';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsField from './form/SettingsField.vue';
import SettingsToggleRow from './form/SettingsToggleRow.vue';
import SettingsNote from './form/SettingsNote.vue';
import SettingsStatus from './form/SettingsStatus.vue';

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
/** 实际运行的后端（WebGPU / WASM），模型加载后才确定 */
const activeBackend = ref<EmbeddingBackend | null>(EmbeddingService.getActiveBackend());
const chapterModelVersion = CHAPTER_MODEL_VERSION.split('@').pop() ?? '';
const backendLabel = computed(() => {
  if (activeBackend.value === 'webgpu') return 'WebGPU';
  if (activeBackend.value === 'wasm') return t('embeddingUi.slowWasm');
  return '—';
});
const backendClass = computed(() => {
  if (activeBackend.value === 'webgpu') return 'text-green-400';
  if (activeBackend.value === 'wasm') return 'text-amber-300';
  return 'text-moon/60';
});
const downloadProgress = ref<number | null>(null);
const downloadFile = ref('');
const downloadPhase = ref<NonNullable<EmbeddingProgressEvent['phase']>>('preparing');
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

const resetDownloadProgress = () => {
  downloadProgress.value = null;
  downloadFile.value = '';
  downloadPhase.value = 'preparing';
  lastError.value = null;
};

const updateDownloadProgress = (detail: EmbeddingProgressEvent) => {
  // 单文件 progress 不能代表整个模型；没有权重总量时保留活动进度。
  if (Number.isFinite(detail.aggregatePercent)) {
    downloadProgress.value = Math.max(
      downloadProgress.value ?? 0,
      Math.min(95, detail.aggregatePercent!),
    );
  }
  if (detail.phase) downloadPhase.value = detail.phase;
  if (detail.file) downloadFile.value = detail.file;
  if (detail.phase === 'initializing') downloadFile.value = '';
};

const handleDownload = async () => {
  resetDownloadProgress();
  await EmbeddingService.warmup();
};

const handleRetry = async () => {
  resetDownloadProgress();
  await EmbeddingService.reload();
};

const unsubscribers: Array<() => void> = [];

onMounted(async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
  syncFormState();
  embeddingStatus.value = EmbeddingService.getStatus();
  activeBackend.value = EmbeddingService.getActiveBackend();
  const currentProgress = EmbeddingService.getProgress();
  if (embeddingStatus.value === 'loading' && currentProgress)
    updateDownloadProgress(currentProgress);

  unsubscribers.push(
    EmbeddingService.addEventListener('status-changed', (e: CustomEvent) => {
      embeddingStatus.value = (e.detail as { status: EmbeddingStatus }).status;
      activeBackend.value = EmbeddingService.getActiveBackend();
      if (embeddingStatus.value === 'loading') resetDownloadProgress();
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
      if (embeddingStatus.value === 'loading') updateDownloadProgress(detail);
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
const showProgressBar = computed(() => embeddingStatus.value === 'loading');
const progressValue = computed(() => downloadProgress.value ?? undefined);
const progressMode = computed(() =>
  downloadProgress.value === null ? 'indeterminate' : 'determinate',
);
const downloadPhaseLabel = computed(() => {
  switch (downloadPhase.value) {
    case 'downloading':
      return t('settingsUi.embedding.downloadingFiles');
    case 'initializing':
    case 'ready':
      return t('settingsUi.embedding.initializingModel');
    default:
      return t('settingsUi.embedding.preparingDownload');
  }
});
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
const semanticDescription = computed(() => {
  if (effectiveEnableLocalEmbedding.value) return t('settingsUi.embedding.semanticOn');
  if (isMobile.value) return t('settingsUi.embedding.semanticMobile');
  return t('settingsUi.embedding.semanticNeedsEmbedding');
});
</script>

<template>
  <SettingsPanel>
    <!-- 嵌入模型：本地嵌入总开关 + 模型状态 -->
    <SettingsSection
      :title="t('settingsUi.embedding.modelTitle')"
      :description="t('settingsUi.embedding.modelDescription')"
    >
      <SettingsToggleRow
        :label="t('settingsUi.embedding.enable')"
        :model-value="effectiveEnableLocalEmbedding"
        :disabled="isMobile"
        @update:model-value="updateEnableLocalEmbedding"
      >
        <template #hint>
          <template v-if="isMobile">
            <span class="pi pi-mobile mr-1" aria-hidden="true"></span>
            {{ t('settingsUi.embedding.mobileHint') }}
          </template>
          <template v-else>
            {{ t('settingsUi.embedding.desktopHint') }}
          </template>
        </template>
      </SettingsToggleRow>

      <div v-if="effectiveEnableLocalEmbedding" class="embedding-status">
        <div class="flex items-center justify-between gap-3">
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
          <div class="flex items-center justify-between text-xs text-moon/70 mb-2">
            <span>{{ t('settingsUi.embedding.loadingProgress') }}</span>
            <span v-if="downloadProgress !== null" class="tabular-nums"
              >{{ downloadProgress }}%</span
            >
          </div>
          <ProgressBar
            :value="progressValue"
            :mode="progressMode"
            :show-value="false"
            class="h-2 embedding-download-progress"
            :aria-label="t('settingsUi.embedding.loadingProgress')"
          />
          <p class="text-xs text-moon/70 mt-2">{{ downloadPhaseLabel }}</p>
          <p v-if="downloadFile" class="text-xs text-moon/50 mt-1 truncate">{{ downloadFile }}</p>
        </div>

        <SettingsStatus v-if="showError" tone="error">{{ lastError }}</SettingsStatus>

        <SettingsStatus tone="muted">
          {{ MODEL_ID }}
          {{ t('settingsUi.embedding.modelSize') }}
        </SettingsStatus>

        <!-- 运行后端与模型版本（原向量化面板底部的状态块） -->
        <dl
          class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-moon/60"
          data-testid="embedding-backend-info"
        >
          <dt>{{ t('embeddingUi.backend') }}</dt>
          <dd :class="backendClass">{{ backendLabel }}</dd>
          <dt>{{ t('embeddingUi.model') }}</dt>
          <dd class="font-mono break-all text-moon/70">
            {{ MODEL_VERSION
            }}<span class="text-moon/50">{{
              t('embeddingUi.chapterModel', { version: chapterModelVersion })
            }}</span>
          </dd>
        </dl>
      </div>
    </SettingsSection>

    <!-- 记忆注入 -->
    <SettingsSection
      :title="t('settingsUi.embedding.memoryTitle')"
      :description="t('settingsUi.embedding.memoryDescription')"
    >
      <!-- 字符预算 -->
      <SettingsField :label="t('settingsUi.embedding.charBudget')">
        <template #label-aside>{{ charBudget }}</template>
        <Slider
          v-model="charBudget"
          :min="500"
          :max="5000"
          :step="100"
          class="w-full"
          :aria-label="t('settingsUi.embedding.charBudget')"
          @slideend="updateCharBudget($event)"
        />
        <template #hint>
          <div class="flex justify-between">
            <span>500</span>
            <span>5000</span>
          </div>
        </template>
      </SettingsField>

      <!-- 最低分数阈值 -->
      <SettingsField :label="t('settingsUi.embedding.minScore')">
        <template #label-aside>{{ minScoreThreshold.toFixed(2) }}</template>
        <Slider
          v-model="minScoreThreshold"
          :min="0"
          :max="0.5"
          :step="0.01"
          class="w-full"
          :aria-label="t('settingsUi.embedding.minScore')"
          @slideend="updateMinScoreThreshold($event)"
        />
        <template #hint>
          <div class="flex justify-between">
            <span>{{ t('settingsUi.embedding.minScoreAll') }}</span>
            <span>0.5</span>
          </div>
        </template>
      </SettingsField>

      <!-- 语义信号开关 -->
      <SettingsToggleRow
        :label="t('settingsUi.embedding.semantic')"
        :hint="semanticDescription"
        :model-value="enableSemantic"
        :disabled="!effectiveEnableLocalEmbedding"
        @update:model-value="updateEnableSemantic"
      />

      <SettingsNote>{{ t('settingsUi.embedding.weights') }}</SettingsNote>
    </SettingsSection>

    <!-- 章节嵌入 -->
    <SettingsSection
      :title="t('settingsUi.embedding.chapterTitle')"
      :description="t('settingsUi.embedding.chapterDescription')"
    >
      <SettingsNote>
        {{ t('settingsUi.embedding.chapterAuto') }}
        <strong>{{ t('settingsUi.embedding.backgroundSection') }}</strong>
        {{ t('settingsUi.embedding.chapterAutoSuffix') }}
      </SettingsNote>
    </SettingsSection>
  </SettingsPanel>
</template>

<style scoped>
.embedding-status {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  background: var(--white-opacity-3);
}

.embedding-download-progress :deep(.p-progressbar-value) {
  transition: width 400ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .embedding-download-progress :deep(.p-progressbar-value) {
    transition: none;
  }
}
</style>
