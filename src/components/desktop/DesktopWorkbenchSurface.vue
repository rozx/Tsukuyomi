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
  border: 1px solid var(--white-opacity-8); /* token: white @ 8% */
  box-shadow: 0 20px 56px rgba(3, 7, 18, 0.18);
  overflow: hidden;
}

.dws-shell--padded {
  padding: 1.2rem;
}

.dws-shell--default {
  background:
    linear-gradient(180deg, var(--tsukuyomi-opacity-8), var(--tsukuyomi-opacity-2)),
    var(--shell-opacity-82); /* tokens: tsukuyomi-500 @ 8→2% over shell @ 82% */
}

.dws-shell--muted {
  background:
    linear-gradient(180deg, var(--tsukuyomi-opacity-10), var(--tsukuyomi-opacity-3)),
    var(--shell-opacity-72); /* tokens: tsukuyomi-500 @ 10→3% over shell @ 72% */
}
</style>
