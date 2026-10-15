<script setup lang="ts">
/**
 * 路由切换较慢时的内容区加载指示：在 `<main>` 中央淡入一枚「正在加载…」胶囊。
 * 旧页面在新页面加载完成前保持显示，胶囊浮在其上方，不遮挡交互。
 *
 * 由 MainLayout 与页面一起 Teleport 进当前变体的 route outlet。`<main>` 是滚动容器，
 * 绝对定位会随内容滚走，因此出现时按 `<main>` 的位置换算成固定定位。
 */
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { routeLoading } from 'src/router/route-loading';

const { t } = useI18n();
const anchor = ref<HTMLElement | null>(null);
const area = ref<Record<string, string>>({});

watch(routeLoading, (loading) => {
  if (!loading) return;
  const rect = anchor.value?.closest('main')?.getBoundingClientRect();
  area.value = rect
    ? {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }
    : {};
});
</script>

<template>
  <span ref="anchor" hidden />
  <Transition name="route-loading">
    <div v-if="routeLoading" class="route-loading" :style="area" role="status" aria-live="polite">
      <div class="route-loading-pill">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <span>{{ t('libraryUi.loadingShort') }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.route-loading {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.route-loading-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.95rem;
  border-radius: 999px;
  border: 1px solid var(--white-opacity-8);
  background: rgba(14, 18, 24, 0.78); /* token: near night-300 @ 78% */
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  color: var(--moon-50-opacity-75);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}

.route-loading-pill .pi {
  color: var(--primary-200);
  font-size: 0.85rem;
}

.route-loading-enter-active,
.route-loading-leave-active {
  transition: opacity 180ms ease;
}

.route-loading-enter-active .route-loading-pill,
.route-loading-leave-active .route-loading-pill {
  transition: transform 180ms ease;
}

.route-loading-enter-from,
.route-loading-leave-to {
  opacity: 0;
}

.route-loading-enter-from .route-loading-pill,
.route-loading-leave-to .route-loading-pill {
  transform: translateY(4px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .route-loading-pill .pi {
    animation: none;
  }
}
</style>
