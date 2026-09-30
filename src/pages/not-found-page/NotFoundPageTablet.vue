<script setup lang="ts">
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const goHome = () => void router.push('/');
const goLibrary = () => void router.push('/books');
</script>

<template>
  <div class="nf-tablet">
    <div class="nf-inner">
      <div class="nf-code">404</div>
      <div class="nf-title">{{ t('appUi.notFound.title') }}</div>
      <div class="nf-sub">{{ t('appUi.notFound.subtitle') }}</div>
      <div class="nf-actions">
        <Button
          :label="t('appUi.notFound.goHome')"
          icon="pi pi-home"
          class="p-button-primary"
          @click="goHome"
        />
        <Button
          :label="t('appUi.notFound.openLibrary')"
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
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
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
  color: var(--moon-50-opacity-85);
  letter-spacing: -0.03em;
  line-height: 1;
}

.nf-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
}

.nf-sub {
  font-size: 13px;
  color: var(--moon-50-opacity-60);
  line-height: 1.6;
}

.nf-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
</style>
