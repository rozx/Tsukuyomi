<script setup lang="ts">
import Button from 'primevue/button';

// 嵌入功能未启用提示：移动端/桌面端两套文案 + 前往设置按钮。
defineProps<{
  isMobile: boolean;
}>();

defineEmits<{ openSettings: [] }>();
</script>

<template>
  <div
    class="flex flex-col gap-2 p-3 bg-moon/5 border border-moon/10 rounded text-xs text-moon-50"
  >
    <div class="flex items-start gap-2">
      <i class="pi pi-info-circle mt-0.5 text-amber-300 shrink-0"></i>
      <div class="flex-1 min-w-0">
        <template v-if="isMobile">
          <div class="font-medium text-moon-100">移动设备不支持本地嵌入</div>
          <p class="mt-1">
            模型过大、WebGPU 在移动浏览器上不稳定,本功能在移动端被强制禁用。 请在桌面端开启并生成向量,手机端只读使用。
          </p>
        </template>
        <template v-else>
          <div class="font-medium text-moon-100">本地嵌入未启用</div>
          <p class="mt-1">
            启用后可在本地下载嵌入模型(约 340–465 MB),支持语义记忆检索与章节向量搜索。
            关闭状态下所有相关操作按钮均已隐藏。
          </p>
        </template>
      </div>
    </div>
    <Button
      v-if="!isMobile"
      label="前往设置开启"
      size="small"
      severity="primary"
      icon="pi pi-cog"
      class="w-full"
      @click="$emit('openSettings')"
    />
  </div>
</template>
