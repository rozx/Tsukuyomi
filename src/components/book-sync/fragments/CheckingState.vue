<script setup lang="ts">
/** 打开会话与快速检查（读取目录）进行中的占位。 */
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="chk" role="status">
    <i class="pi pi-spin pi-spinner" aria-hidden="true" />
    <span>{{ t('bookUi.sync.checking') }}</span>
  </div>
</template>

<style scoped>
.chk {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 2.5rem 1rem;
  font-size: 0.82rem;
  color: rgba(226, 232, 240, 0.6);
}
</style>
