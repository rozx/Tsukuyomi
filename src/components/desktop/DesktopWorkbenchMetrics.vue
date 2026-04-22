<script setup lang="ts">
withDefaults(
  defineProps<{
    items: Array<{
      label: string;
      value: string | number;
      wide?: boolean;
    }>;
  }>(),
  {},
);
</script>

<template>
  <div class="dwm-grid">
    <div v-for="item in items" :key="item.label" class="dwm-card">
      <div class="dwm-label">{{ item.label }}</div>
      <div class="dwm-value" :class="{ 'dwm-value--wide': item.wide }">{{ item.value }}</div>
    </div>
  </div>
</template>

<style scoped>
.dwm-grid {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.dwm-card {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 0.45rem 0.78rem;
}

.dwm-label {
  min-width: 0;
  font-size: 0.64rem;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.48);
}

.dwm-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1;
  color: rgba(247, 244, 236, 0.96);
}

.dwm-value--wide {
  font-size: 0.98rem;
}
</style>
