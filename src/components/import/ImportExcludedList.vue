<script setup lang="ts">
/** 提取时排除的内容（导航、广告、版权等），可展开核对清理是否正确。 */
import { computed, ref } from 'vue';

const props = defineProps<{ entries: { text: string; reason: string }[] }>();
const open = ref(false);
const chevron = computed(() => (open.value ? 'pi-chevron-down' : 'pi-chevron-right'));
const label = computed(() => `提取时排除的内容（${props.entries.length} 处）`);
</script>

<template>
  <div class="iel">
    <button type="button" class="iel-toggle" :aria-expanded="open" @click="open = !open">
      <i :class="['pi', chevron]" aria-hidden="true" />
      {{ label }}
    </button>
    <ul v-if="open" class="iel-list">
      <li v-for="(entry, index) in entries" :key="index">
        <span class="iel-reason">{{ entry.reason }}</span>
        <span class="iel-text">{{ entry.text }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.iel-toggle {
  font-size: 0.75rem;
  color: rgb(165, 180, 252);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.iel-list {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.iel-list li {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.75rem;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
}

.iel-reason {
  color: rgb(253, 224, 71);
}

.iel-text {
  color: rgba(226, 232, 240, 0.65);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
