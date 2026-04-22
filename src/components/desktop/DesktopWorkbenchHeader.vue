<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string;
    title: string;
    description?: string;
  }>(),
  {
    eyebrow: '',
    description: '',
  },
);
</script>

<template>
  <header class="dwh-shell">
    <div class="dwh-hero">
      <div class="dwh-copy">
        <div v-if="eyebrow" class="dwh-eyebrow">{{ eyebrow }}</div>
        <h1 class="dwh-title">{{ title }}</h1>
        <p v-if="description" class="dwh-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="dwh-actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="$slots.metrics" class="dwh-metrics">
      <slot name="metrics" />
    </div>
  </header>
</template>

<style scoped>
.dwh-shell {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.dwh-hero,
.dwh-metrics {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(186, 201, 219, 0.12), transparent 45%),
    linear-gradient(135deg, rgba(12, 16, 24, 0.92), rgba(12, 16, 24, 0.76));
  box-shadow: 0 24px 64px rgba(3, 7, 18, 0.24);
  backdrop-filter: blur(18px);
}

.dwh-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem 1.75rem;
  padding: clamp(1.2rem, 1vw + 0.95rem, 1.8rem);
}

.dwh-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dwh-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(186, 201, 219, 0.82);
}

.dwh-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: clamp(2rem, 1.2vw + 1.65rem, 2.7rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: rgba(247, 244, 236, 0.98);
}

.dwh-description {
  max-width: 52rem;
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.65;
  color: rgba(247, 244, 236, 0.68);
}

.dwh-actions {
  width: min(33rem, 100%);
  min-width: min(24rem, 100%);
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
}

.dwh-metrics {
  padding: 0.95rem 1.15rem;
}

@media (max-width: 1024px) {
  .dwh-hero {
    flex-direction: column;
  }

  .dwh-actions {
    width: 100%;
    min-width: 0;
    justify-content: stretch;
  }
}
</style>
