<script setup lang="ts">
/**
 * 深度检查：逐章抓取未检查的已导入章节并比对正文。带进度，可取消；
 * 取消后已完成的比对结果保留。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { changeset, deep, working, startDeepCheck, cancelDeepCheck } = injectBookSync();

const unchecked = computed(() => changeset.value?.unchecked.length ?? 0);
const percent = computed(() =>
  deep.value.total ? Math.round((deep.value.completed / deep.value.total) * 100) : 0,
);
</script>

<template>
  <section class="dcb">
    <template v-if="deep.running">
      <div class="dcb-row">
        <span class="dcb-text">
          正在深度检查
          <template v-if="deep.total">{{ deep.completed }} / {{ deep.total }}</template>
        </span>
        <Button
          label="取消"
          aria-label="取消深度检查"
          size="small"
          severity="secondary"
          text
          @click="cancelDeepCheck"
        />
      </div>
      <ProgressBar :value="percent" :show-value="false" class="dcb-bar" />
    </template>
    <div v-else class="dcb-row">
      <span class="dcb-text">
        <template v-if="unchecked">{{ unchecked }} 章已导入章节尚未比对正文</template>
        <template v-else>已导入章节都已比对</template>
      </span>
      <Button
        label="深度检查"
        icon="pi pi-search"
        size="small"
        outlined
        :disabled="unchecked === 0 || working"
        @click="startDeepCheck()"
      />
    </div>
  </section>
</template>

<style scoped>
.dcb {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.8rem;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.07);
  border: 1px solid rgba(129, 140, 248, 0.2);
}

.dcb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.dcb-text {
  font-size: 0.76rem;
  color: rgba(226, 232, 240, 0.75);
}

.dcb-bar {
  height: 0.3rem;
}
</style>
