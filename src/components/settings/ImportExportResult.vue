<script setup lang="ts">
/**
 * 导入 / 导出资料完成后的结果条（成功绿、失败红 + 完成时间）。
 * data-testid 等属性由父组件透传到根元素。
 */
import { useI18n } from 'vue-i18n';

defineProps<{
  ok: boolean;
  detail: string;
  at: number;
}>();

const { t, locale } = useI18n();

const finishedAt = (at: number) =>
  t('settingsUi.importExport.finishedAt', {
    time: new Date(at).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }),
  });
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
    :class="ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'"
    role="status"
  >
    <i
      :class="ok ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'"
      class="mt-0.5"
      aria-hidden="true"
    />
    <div class="min-w-0 space-y-0.5">
      <p class="break-words">{{ detail }}</p>
      <p class="opacity-70">{{ finishedAt(at) }}</p>
    </div>
  </div>
</template>
