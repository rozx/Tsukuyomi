<script setup lang="ts">
/** 打开会话与快速检查（读取目录）进行中的占位。 */
</script>

<template>
  <div class="chk" role="status">
    <i class="pi pi-spin pi-spinner" aria-hidden="true" />
    <span>正在读取目录并检查更新…</span>
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
