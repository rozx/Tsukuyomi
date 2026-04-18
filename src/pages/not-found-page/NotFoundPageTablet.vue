<script setup lang="ts">
import { useRouter } from 'vue-router';
import Button from 'primevue/button';

const router = useRouter();

const goHome = () => void router.push('/');
const goLibrary = () => void router.push('/books');
</script>

<template>
  <div class="nf-tablet">
    <div class="nf-inner">
      <div class="nf-code">404</div>
      <div class="nf-title">这片夜色里没有找到页面</div>
      <div class="nf-sub">链接可能已经失效，或书册被移动到了别处。</div>
      <div class="nf-actions">
        <Button
          label="返回首页"
          icon="pi pi-home"
          class="p-button-primary"
          @click="goHome"
        />
        <Button
          label="打开书库"
          icon="pi pi-book"
          class="p-button-outlined"
          @click="goLibrary"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-tablet {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.nf-inner {
  max-width: 520px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.nf-code {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 14vh;
  font-weight: 600;
  color: rgba(247, 244, 236, 0.85);
  letter-spacing: -0.03em;
  line-height: 1;
}

.nf-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.01em;
}

.nf-sub {
  font-size: 13px;
  color: rgba(247, 244, 236, 0.6);
  line-height: 1.6;
}

.nf-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
</style>
