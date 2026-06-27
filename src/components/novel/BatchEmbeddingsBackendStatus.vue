<script setup lang="ts">
import Button from 'primevue/button';

// 全局状态块：模型版本 / 后端(WebGPU/WASM/—) / 状态 + 暂停/恢复按钮。
defineProps<{
  modelVersion: string;
  chapterModelVersion: string;
  activeBackend: string | null;
  statusColor: string;
  statusText: string;
  running: boolean;
  paused: boolean;
}>();

defineEmits<{
  pause: [];
  resume: [];
}>();
</script>

<template>
  <div class="flex flex-col gap-1 text-xs text-moon-50 px-1">
    <div class="flex items-start justify-between gap-2">
      <span class="shrink-0">模型:</span>
      <span class="font-mono text-right min-w-0 break-all"
        >{{ modelVersion
        }}<span class="text-moon-300">(章节: @{{ chapterModelVersion.split('@').pop() }})</span></span
      >
    </div>
    <div class="flex items-center justify-between">
      <span>后端:</span>
      <span
        :class="
          activeBackend === 'webgpu'
            ? 'text-green-400 font-medium'
            : activeBackend === 'wasm'
              ? 'text-amber-300'
              : 'text-moon-50'
        "
      >
        <template v-if="activeBackend === 'webgpu'">WebGPU</template>
        <template v-else-if="activeBackend === 'wasm'">WASM (慢)</template>
        <template v-else>—</template>
      </span>
    </div>
    <div class="flex items-center justify-between">
      <span>状态:</span>
      <span :class="statusColor">● {{ statusText }}</span>
    </div>
    <div v-if="running || paused" class="flex justify-end mt-2">
      <Button
        v-if="!paused"
        label="暂停"
        size="small"
        severity="warning"
        icon="pi pi-pause"
        @click="$emit('pause')"
      />
      <Button
        v-else
        label="恢复"
        size="small"
        severity="success"
        icon="pi pi-play"
        @click="$emit('resume')"
      />
    </div>
  </div>
</template>
