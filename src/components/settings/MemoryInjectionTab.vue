<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
const minScoreThreshold = ref(0.3);

const embeddingStatus = ref<EmbeddingStatus>(EmbeddingService.getStatus());
const downloadProgress = ref<number | null>(null);
const downloadFile = ref('');
const lastError = ref<string | null>(null);
const showAdvanced = ref(false);

const syncFormState = () => {
  charBudget.value = memoryInjection.value?.charBudget ?? 2000;
  enableSemantic.value = memoryInjection.value?.enableSemantic ?? true;
  minScoreThreshold.value = memoryInjection.value?.minScoreThreshold ?? 0.3;
};

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
  EmbeddingService.__resetForTesting();
  downloadProgress.value = 0;
  lastError.value = null;
  await EmbeddingService.warmup();
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
    }),
  );

  unsubscribers.push(
    EmbeddingService.addEventListener('progress', (e: CustomEvent) => {
      const detail = e.detail as EmbeddingProgressEvent;
      if (detail.progress != null) {
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
    <!-- 字符预算 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-moon/90">记忆注入字符预算</label>
        <span class="text-sm text-moon/70 tabular-nums">{{ charBudget }}</span>
      </div>
      <p class="text-xs text-moon/60">每次翻译时注入的记忆总字符数上限</p>
      <Slider
        :model-value="charBudget"
        :min="500"
        :max="5000"
        :step="100"
        class="w-full"
        @slideend="updateCharBudget($event)"
      />
      <div class="flex justify-between text-xs text-moon/50">
        <span>500</span>
        <span>5000</span>
      </div>
    </div>

    <!-- 语义检索开关 -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm font-medium text-moon/90">语义检索</label>
          <p class="text-xs text-moon/60 mt-0.5">
            使用本地嵌入模型为记忆生成向量，提升相关记忆的匹配精度
          </p>
        </div>
        <ToggleSwitch
          :model-value="enableSemantic"
          @update:model-value="updateEnableSemantic($event as boolean)"
        />
      </div>

      <!-- 嵌入模型状态 -->
      <div v-if="enableSemantic" class="p-3 bg-moon/5 rounded-lg border border-moon/10 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span :class="[statusIcon, statusClass]"></span>
            <span class="text-xs text-moon/80">{{ statusLabel }}</span>
          </div>
          <!-- 按状态显示不同按钮 -->
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

        <!-- 下载进度 -->
        <div v-if="embeddingStatus === 'loading' && downloadProgress != null">
          <ProgressBar :value="downloadProgress" :show-value="true" class="h-2" />
          <p v-if="downloadFile" class="text-xs text-moon/50 mt-1 truncate">{{ downloadFile }}</p>
        </div>

        <!-- 错误信息 -->
        <p v-if="lastError && embeddingStatus === 'failed'" class="text-xs text-red-400">
          {{ lastError }}
        </p>

        <p class="text-xs text-moon/50">
          模型: {{ MODEL_ID }} (~195 MB, 首次使用需下载)
        </p>
      </div>
    </div>

    <!-- 高级设置折叠区 -->
    <div class="border-t border-moon/10 pt-3">
      <button
        class="flex items-center gap-1 text-xs text-moon/60 hover:text-moon/80 transition-colors"
        @click="showAdvanced = !showAdvanced"
      >
        <span :class="['pi', showAdvanced ? 'pi-chevron-down' : 'pi-chevron-right']" />
        高级设置
      </button>

      <div v-if="showAdvanced" class="mt-3 space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs text-moon/80">最低分数阈值</label>
          <span class="text-xs text-moon/60 tabular-nums">{{ minScoreThreshold.toFixed(1) }}</span>
        </div>
        <p class="text-xs text-moon/50">低于此分数的记忆不会被注入（满分 6.0）</p>
        <Slider
          :model-value="minScoreThreshold"
          :min="0"
          :max="3"
          :step="0.1"
          class="w-full"
          @slideend="updateMinScoreThreshold($event)"
        />
        <div class="flex justify-between text-xs text-moon/40">
          <span>0（全部注入）</span>
          <span>3.0</span>
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
      <p class="text-xs text-moon/70">
        <span class="pi pi-info-circle mr-1"></span>
        记忆注入使用三信号评分（语义相似度 + 关键词匹配 + 时间衰减）自动选择与当前翻译内容最相关的记忆。
        即使未启用语义检索，关键词和时间衰减仍会生效。
      </p>
    </div>
  </div>
</template>
