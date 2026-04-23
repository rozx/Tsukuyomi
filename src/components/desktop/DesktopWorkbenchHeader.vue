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
  <header class="dwh">
    <div class="dwh-main">
      <div class="dwh-copy">
        <span v-if="eyebrow" class="dwh-eyebrow">{{ eyebrow }}</span>
        <h1 class="dwh-title">{{ title }}</h1>
        <p v-if="description" class="dwh-desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="dwh-actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.metrics" class="dwh-metrics">
      <div class="dwh-metrics-content">
        <slot name="metrics" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.dwh {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  flex-shrink: 0;
}

.dwh-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.85rem 1rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--white-opacity-6);
}

.dwh-copy {
  min-width: 0;
  max-width: 46rem;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}


.dwh-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: clamp(1.05rem, 0.4vw + 1rem, 1.3rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: var(--moon-opacity-100);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.dwh-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.dwh-desc {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--moon-opacity-50);
  max-width: 42rem;
}

.dwh-actions {
  min-width: 0;
  width: min(100%, 44rem);
  justify-self: end;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: 0.5rem;
}

.dwh-metrics {
  width: 100%;
}

.dwh-metrics-content {
  width: 100%;
  min-width: 0;
}

@media (max-width: 1280px) {
  .dwh-main {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .dwh-actions {
    width: 100%;
    justify-self: stretch;
    justify-content: flex-start;
  }
}

@media (max-width: 820px) {
  .dwh {
    gap: 0.45rem;
  }

  .dwh-main {
    gap: 0.7rem;
    padding-bottom: 0.55rem;
  }

  .dwh-title {
    font-size: 1.02rem;
  }
}
</style>
