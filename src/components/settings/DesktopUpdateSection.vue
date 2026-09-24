<template>
  <div v-if="available" class="desktop-update-section" aria-live="polite">
    <p>
      {{ labels[state.phase] }}<span v-if="state.targetVersion"> · v{{ state.targetVersion }}</span>
    </p>
    <progress
      v-if="state.phase === 'downloading'"
      :value="state.progress ?? 0"
      max="100"
      aria-label="更新下载进度"
    />
    <p v-if="state.message" class="update-message">{{ state.message }}</p>
    <div class="update-actions">
      <Button v-if="state.phase === 'ready'" label="重启并更新" size="small" @click="restart" />
      <Button
        v-else
        label="检查更新"
        size="small"
        outlined
        :disabled="busy || state.phase === 'unavailable'"
        @click="check"
      />
      <a
        href="https://github.com/rozx/Tsukuyomi/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        >查看发布版本</a
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import { useDesktopUpdates } from 'src/composables/useDesktopUpdates';
const { state, available, busy, check, restart } = useDesktopUpdates();
const labels = {
  unavailable: '自动更新不可用',
  idle: '暂无待安装更新',
  checking: '正在检查更新',
  downloading: '正在下载更新',
  ready: '更新已下载',
  preparing: '正在检查任务与保存状态',
  installing: '正在重启更新',
  error: '更新失败，可以重试',
};
</script>

<style scoped>
.desktop-update-section {
  width: min(100%, 420px);
  font-size: 0.85rem;
}
.update-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.75rem;
}
.update-message {
  color: var(--moon-50-opacity-70);
  overflow-wrap: anywhere;
}
progress {
  width: 100%;
}
</style>
