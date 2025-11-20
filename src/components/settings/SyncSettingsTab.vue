<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import { useConfirm } from 'primevue/useconfirm';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import type { SyncConfig } from 'src/types/sync';

const props = defineProps<{
  visible: boolean;
}>();

const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const settingsStore = useSettingsStore();
const toast = useToastWithHistory();
const confirm = useConfirm();

// Gist 同步相关
const gistSyncService = new GistSyncService();
const gistUsername = ref('');
const gistToken = ref('');
const gistEnabled = ref(false);
const gistId = ref('');
const gistSyncing = ref(false);
const gistValidating = ref(false);
const gistLastSyncTime = ref<number | undefined>(undefined);
const autoSyncEnabled = ref(false);
const syncIntervalMinutes = ref(5);

// 初始化 Gist 配置
watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      const config = settingsStore.gistSync;
      gistUsername.value = config.syncParams.username ?? '';
      gistToken.value = config.secret ?? '';
      gistEnabled.value = config.enabled ?? false;
      gistId.value = config.syncParams.gistId ?? '';
      gistLastSyncTime.value = config.lastSyncTime || undefined;
      // 自动同步：如果 syncInterval > 0 则认为启用了自动同步
      autoSyncEnabled.value = config.syncInterval > 0;
      syncIntervalMinutes.value =
        config.syncInterval > 0 ? Math.floor(config.syncInterval / 60000) : 5;
    }
  },
  { immediate: true },
);

// 保存 Gist 配置
const saveGistConfig = () => {
  settingsStore.setGistSyncCredentials(gistUsername.value, gistToken.value);
  if (gistId.value) {
    settingsStore.setGistId(gistId.value);
  }
  settingsStore.setGistSyncEnabled(gistEnabled.value);
  // 保存自动同步设置
  settingsStore.setSyncInterval(autoSyncEnabled.value ? syncIntervalMinutes.value * 60000 : 0);
};

// 验证 GitHub token
const validateGistToken = async () => {
  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '验证失败',
      detail: '请先输入 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  gistValidating.value = true;
  try {
    const config = settingsStore.gistSync;
    const testConfig: SyncConfig = {
      ...config,
      enabled: true,
      syncParams: {
        ...config.syncParams,
        username: gistUsername.value,
      },
      secret: gistToken.value,
    };
    const result = await gistSyncService.validateToken(testConfig);

    if (result.valid) {
      saveGistConfig();
      toast.add({
        severity: 'success',
        summary: '验证成功',
        detail: 'GitHub token 验证通过',
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '验证失败',
        detail: result.error || 'Token 验证失败',
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '验证失败',
      detail: error instanceof Error ? error.message : '验证时发生未知错误',
      life: 5000,
    });
  } finally {
    gistValidating.value = false;
  }
};

// 上传到 Gist
const uploadToGist = async () => {
  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '同步失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  gistSyncing.value = true;
  try {
    const baseConfig = settingsStore.gistSync;
    const config: SyncConfig = {
      ...baseConfig,
      enabled: true,
      syncParams: {
        ...baseConfig.syncParams,
        username: gistUsername.value,
        ...(gistId.value ? { gistId: gistId.value } : {}),
      },
      secret: gistToken.value,
    };

    const result = await gistSyncService.uploadToGist(config, {
      aiModels: aiModelsStore.models,
      appSettings: settingsStore.getAllSettings(),
      novels: booksStore.books,
      coverHistory: coverHistoryStore.covers,
    });

    if (result.success) {
      // 更新 Gist ID（无论是更新还是重新创建，都需要更新为新 ID）
      if (result.gistId) {
        gistId.value = result.gistId;
        settingsStore.setGistId(result.gistId);
        // 如果重新创建了 Gist，显示提示信息
        if (result.isRecreated) {
          toast.add({
            severity: 'warn',
            summary: 'Gist 已重新创建',
            detail: `原 Gist 不存在，已创建新的 Gist (ID: ${result.gistId})`,
            life: 5000,
          });
        }
      }
      settingsStore.updateLastSyncTime();
      gistLastSyncTime.value = Date.now();
      saveGistConfig();
      toast.add({
        severity: 'success',
        summary: '同步成功',
        detail: result.message || '数据已成功同步到 Gist',
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '同步失败',
        detail: result.error || '同步到 Gist 时发生未知错误',
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '同步失败',
      detail: error instanceof Error ? error.message : '同步时发生未知错误',
      life: 5000,
    });
  } finally {
    gistSyncing.value = false;
  }
};

// 从 Gist 下载
const downloadFromGist = async () => {
  if (!gistId.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '下载失败',
      detail: '请先配置 Gist ID',
      life: 3000,
    });
    return;
  }

  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '下载失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  gistSyncing.value = true;
  try {
    const baseConfig = settingsStore.gistSync;
    const config: SyncConfig = {
      ...baseConfig,
      enabled: true,
      syncParams: {
        ...baseConfig.syncParams,
        username: gistUsername.value,
        gistId: gistId.value,
      },
      secret: gistToken.value,
    };

    const result = await gistSyncService.downloadFromGist(config);

    if (result.success && result.data) {
      // 覆盖当前的 AI 模型数据
      if (result.data.aiModels && result.data.aiModels.length > 0) {
        aiModelsStore.clearModels();
        result.data.aiModels.forEach((model) => {
          aiModelsStore.addModel(model);
        });
      }

      // 覆盖当前的书籍数据
      if (result.data.novels && result.data.novels.length > 0) {
        booksStore.clearBooks();
        result.data.novels.forEach((novel) => {
          booksStore.addBook(novel);
        });
      }

      // 覆盖当前的封面历史数据
      if (result.data.coverHistory && result.data.coverHistory.length > 0) {
        coverHistoryStore.clearHistory();
        result.data.coverHistory.forEach((cover) => {
          coverHistoryStore.addCover(cover);
        });
      }

      // 覆盖当前的应用设置（但保留 Gist 配置）
      if (result.data.appSettings) {
        const currentGistSync = settingsStore.gistSync;
        settingsStore.importSettings(result.data.appSettings);
        // 恢复 Gist 配置
        settingsStore.updateGistSync(currentGistSync);
      }

      settingsStore.updateLastSyncTime();
      gistLastSyncTime.value = Date.now();
      toast.add({
        severity: 'success',
        summary: '下载成功',
        detail: result.message || '从 Gist 下载数据成功',
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '下载失败',
        detail: result.error || '从 Gist 下载数据时发生未知错误',
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '下载失败',
      detail: error instanceof Error ? error.message : '下载时发生未知错误',
      life: 5000,
    });
  } finally {
    gistSyncing.value = false;
  }
};

// 删除 Gist
const deleteGist = () => {
  if (!gistId.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '删除失败',
      detail: '请先配置 Gist ID',
      life: 3000,
    });
    return;
  }

  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '删除失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  // 使用 ConfirmDialog 确认删除
  confirm.require({
    message: `确定要删除 Gist (ID: ${gistId.value}) 吗？此操作不可撤销，将永久删除 Gist 中的所有数据。`,
    header: '确认删除 Gist',
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-text',
    acceptClass: 'p-button-danger',
    rejectLabel: '取消',
    acceptLabel: '删除',
    accept: async () => {
      gistSyncing.value = true;
      try {
        const baseConfig = settingsStore.gistSync;
        const config: SyncConfig = {
          ...baseConfig,
          enabled: true,
          syncParams: {
            ...baseConfig.syncParams,
            username: gistUsername.value,
            gistId: gistId.value,
          },
          secret: gistToken.value,
        };

        const result = await gistSyncService.deleteGist(config);

        if (result.success) {
          // 清除本地 Gist ID
          gistId.value = '';
          settingsStore.setGistId('');
          saveGistConfig();
          toast.add({
            severity: 'success',
            summary: '删除成功',
            detail: result.message || 'Gist 已成功删除',
            life: 3000,
          });
        } else {
          toast.add({
            severity: 'error',
            summary: '删除失败',
            detail: result.error || '删除 Gist 时发生未知错误',
            life: 5000,
          });
        }
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: '删除失败',
          detail: error instanceof Error ? error.message : '删除时发生未知错误',
          life: 5000,
        });
      } finally {
        gistSyncing.value = false;
      }
    },
  });
};
</script>

<template>
  <div class="p-4 space-y-4">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">Gist 同步设置</h3>
      <p class="text-xs text-moon/70">
        使用 GitHub Gist 同步您的设置和书籍数据。所有数据将保存在一个私有 Gist 中。
      </p>
      <p class="text-xs text-moon/60 mt-1">
        需要 GitHub Personal Access Token，权限需要包含 <code class="text-xs">gist</code>
      </p>
    </div>

    <!-- 启用同步 -->
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <Checkbox
          :binary="true"
          :model-value="gistEnabled"
          input-id="gist-enabled"
          @update:model-value="
            (value) => {
              gistEnabled = value as boolean;
              saveGistConfig();
            }
          "
        />
        <label for="gist-enabled" class="text-xs text-moon/80 cursor-pointer">
          启用 Gist 同步
        </label>
      </div>
    </div>

    <!-- GitHub 用户名 -->
    <div class="space-y-2">
      <label for="gist-username" class="text-xs text-moon/80">GitHub 用户名</label>
      <InputText
        id="gist-username"
        v-model="gistUsername"
        placeholder="输入您的 GitHub 用户名"
        class="w-full"
        :disabled="!gistEnabled"
        @blur="saveGistConfig"
      />
    </div>

    <!-- GitHub Token -->
    <div class="space-y-2">
      <label for="gist-token" class="text-xs text-moon/80">GitHub Personal Access Token</label>
      <Password
        id="gist-token"
        v-model="gistToken"
        placeholder="输入您的 GitHub token"
        class="w-full"
        :disabled="!gistEnabled"
        :feedback="false"
        toggle-mask
        @blur="saveGistConfig"
      />
      <p class="text-xs text-moon/60">
        在 GitHub Settings → Developer settings → Personal access tokens 中创建
      </p>
    </div>

    <!-- Gist ID -->
    <div class="space-y-2">
      <label for="gist-id" class="text-xs text-moon/80">Gist ID（可选）</label>
      <InputText
        id="gist-id"
        v-model="gistId"
        placeholder="留空将自动创建新的 Gist"
        class="w-full"
        :disabled="!gistEnabled"
        @blur="saveGistConfig"
      />
      <p class="text-xs text-moon/60">如果已有 Gist，请输入 Gist ID。留空将自动创建新的 Gist</p>
    </div>

    <!-- 自动同步设置 -->
    <div class="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
      <div class="flex items-center gap-2">
        <Checkbox
          :binary="true"
          :model-value="autoSyncEnabled"
          input-id="auto-sync-enabled"
          :disabled="!gistEnabled"
          @update:model-value="
            (value) => {
              autoSyncEnabled = value as boolean;
              saveGistConfig();
            }
          "
        />
        <label for="auto-sync-enabled" class="text-xs text-moon/80 cursor-pointer">
          启用自动同步
        </label>
      </div>
      <div v-if="autoSyncEnabled" class="space-y-2">
        <label for="sync-interval" class="text-xs text-moon/80">同步间隔（分钟）</label>
        <InputNumber
          id="sync-interval"
          :model-value="syncIntervalMinutes"
          :min="1"
          :max="1440"
          :show-buttons="true"
          class="w-full"
          :disabled="!gistEnabled"
          @update:model-value="
            (value) => {
              syncIntervalMinutes = Number(value) || 5;
              saveGistConfig();
            }
          "
        />
        <p class="text-xs text-moon/60">
          每 {{ syncIntervalMinutes }} 分钟自动同步一次（1-1440 分钟，即最多 24 小时）
        </p>
      </div>
    </div>

    <!-- 最后同步时间 -->
    <div v-if="gistLastSyncTime" class="text-xs text-moon/60">
      最后同步时间：
      {{ new Date(gistLastSyncTime).toLocaleString('zh-CN') }}
    </div>

    <!-- 操作按钮 -->
    <div class="space-y-2 pt-2">
      <Button
        label="验证 Token"
        icon="pi pi-check-circle"
        class="p-button-outlined w-full"
        :disabled="!gistEnabled || gistValidating"
        :loading="gistValidating"
        @click="validateGistToken"
      />
      <div class="grid grid-cols-2 gap-2">
        <Button
          label="上传到 Gist"
          icon="pi pi-upload"
          class="p-button-primary"
          :disabled="!gistEnabled || gistSyncing"
          :loading="gistSyncing"
          @click="uploadToGist"
        />
        <Button
          label="从 Gist 下载"
          icon="pi pi-download"
          class="p-button-outlined"
          :disabled="!gistEnabled || gistSyncing || !gistId"
          :loading="gistSyncing"
          @click="downloadFromGist"
        />
      </div>
    </div>

    <!-- 删除 Gist 按钮（独立区域） -->
    <div class="border-t border-white/10 pt-6 mt-6">
      <Button
        label="删除当前 Gist"
        icon="pi pi-trash"
        class="p-button-danger w-full"
        :disabled="!gistEnabled || gistSyncing || !gistId"
        :loading="gistSyncing"
        @click="deleteGist"
      />
    </div>
  </div>
</template>
