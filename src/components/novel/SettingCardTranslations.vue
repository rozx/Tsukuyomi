<script setup lang="ts">
// 设置卡片翻译展示：数组（角色，多译名标签）/ 字符串（术语）/ 无，三态收敛到叶子组件。
defineProps<{
  translations?: string | string[] | undefined;
}>();
</script>

<template>
  <div class="mb-3">
    <span class="text-xs text-moon-100/50 block mb-1.5">翻译</span>
    <!-- 数组情况 (Character) -->
    <div v-if="Array.isArray(translations)" class="flex flex-wrap gap-1.5">
      <span
        v-for="(t, index) in translations"
        :key="index"
        class="px-2 py-0.5 rounded bg-primary/20 text-primary-200 text-xs border border-primary/10"
      >
        {{ t }}
      </span>
      <span v-if="translations.length === 0" class="text-moon-100/30 text-xs italic">无</span>
    </div>
    <!-- 字符串情况 (Term) -->
    <div v-else-if="translations" class="min-w-0 max-w-full overflow-hidden">
      <p
        class="text-primary-200 text-sm break-words font-medium overflow-hidden leading-6 w-full max-w-full line-clamp-2"
        :title="typeof translations === 'string' ? translations : ''"
      >
        {{ translations }}
      </p>
    </div>
    <div v-else class="text-moon-100/30 text-xs italic">无</div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
