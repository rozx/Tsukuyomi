<script setup lang="ts">
/**
 * 无法回放时的说明与后续入口：缺少配方、配方失效或检查出错。
 * 这些状态下不显示任何章节列表或应用操作。AI 导入关闭时隐藏交接入口。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { phase, message, target, canHandoff, working, recheck, handoff } = injectBookSync();

const creating = computed(() => !!target.value && 'newFrom' in target.value);

const title = computed(() => {
  if (phase.value === 'missing')
    return creating.value ? '这个网站需要 AI 导入' : '这本书还没有更新配方';
  if (phase.value === 'invalid') return '来源配方已失效';
  return '检查失败';
});

const description = computed(() => {
  if (phase.value === 'missing')
    return creating.value
      ? '该网址不属于内置支持的站点，需要由 AI 导入器识别目录与正文。导入完成后会记录来源配方，之后即可在这里检查更新。'
      : '这本书不是从内置站点导入的，也没有由 AI 导入器记录来源配方，因此无法自动检查更新。可以用 AI 导入器为它建立配方。';
  if (phase.value === 'invalid')
    return `${message.value}。可能是站点改版或需要登录，可以用 AI 导入器重新建立配方。`;
  return message.value;
});

const showHandoff = computed(() => phase.value !== 'error' && canHandoff);
// 已有书籍打开（或新建）这本书的配方修复任务，不会自动运行
const handoffLabel = computed(() =>
  creating.value
    ? '交给 AI 导入器'
    : phase.value === 'missing'
      ? '用 AI 导入器建立配方'
      : '用 AI 导入器修复配方',
);
</script>

<template>
  <section class="ipl-card hn" role="status">
    <h3 class="ipl-card-title">
      <i
        :class="phase === 'error' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'"
        aria-hidden="true"
      />
      {{ title }}
    </h3>
    <p class="hn-text">{{ description }}</p>
    <p v-if="phase !== 'error' && !canHandoff" class="ipl-muted">
      当前版本已关闭 AI 导入，已有导入任务与小说均已保留。
    </p>
    <div class="hn-actions">
      <Button
        v-if="showHandoff"
        :label="handoffLabel"
        icon="pi pi-sparkles"
        size="small"
        :disabled="working"
        @click="handoff()"
      />
      <Button
        v-if="phase !== 'missing'"
        label="重新检查"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        outlined
        :disabled="working"
        @click="recheck()"
      />
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped>
.hn {
  border-color: rgba(234, 179, 8, 0.22);
}

.hn-text {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.8);
}

.hn-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
