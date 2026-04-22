<script setup lang="ts">
withDefaults(
  defineProps<{
    tag?: string;
    tone?: 'default' | 'muted';
    padded?: boolean;
  }>(),
  {
    tag: 'section',
    tone: 'default',
    padded: true,
  },
);
</script>

<template>
  <component
    :is="tag"
    class="dws-shell"
    :class="[`dws-shell--${tone}`, { 'dws-shell--padded': padded }]"
  >
    <slot />
  </component>
</template>

<style scoped>
.dws-shell {
  position: relative;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 56px rgba(3, 7, 18, 0.18);
  overflow: hidden;
}

.dws-shell--padded {
  padding: 1.2rem;
}

.dws-shell--default {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02)),
    rgba(10, 14, 20, 0.82);
}

.dws-shell--muted {
  background:
    linear-gradient(180deg, rgba(186, 201, 219, 0.05), rgba(186, 201, 219, 0.01)),
    rgba(9, 12, 18, 0.72);
}
</style>
