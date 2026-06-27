<script setup lang="ts">
/**
 * 手机端阅读器「批量操作」picker（MobileBottomSheet 外壳 + 菜单项循环 + 空态）。
 *
 * 从 BookDetailsMobileReader 抽出以降低段落模板复杂度；状态与方法全部来自
 * injectBookDetailsPage() 上下文（showMobileBatchPicker / mobileBatchMenuItems / runMobileBatchItem）。
 * 样式由 BookDetailsMobile.vue 的非 scoped 样式表统一提供。
 */
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { MenuItem } from 'primevue/menuitem';

const ctx = injectBookDetailsPage();

// 菜单项 key：分隔符用 sep-idx，其余用 label，保证 v-for 稳定
const itemKey = (item: MenuItem, idx: number) =>
  item.separator ? `sep-${idx}` : (item.label ?? `item-${idx}`);
// 危险项样式：沿用桌面菜单的 mbr-menu-danger 标记类
const isDanger = (item: MenuItem) => item.class === 'mbr-menu-danger';
</script>

<template>
  <MobileBottomSheet
    v-model:visible="ctx.showMobileBatchPicker.value"
    title="批量操作"
    eyebrow="CHAPTER · 批量"
  >
    <template v-for="(item, idx) in ctx.mobileBatchMenuItems.value" :key="itemKey(item, idx)">
      <div v-if="item.separator" class="mbr-batch-picker-sep" />
      <button
        v-else
        type="button"
        class="mbr-batch-picker-option"
        :class="{ 'mbr-batch-picker-option--danger': isDanger(item) }"
        @click="ctx.runMobileBatchItem(item)"
      >
        <i
          v-if="item.icon"
          :class="['pi', item.icon, 'mbr-batch-picker-option-icon']"
          aria-hidden="true"
        />
        <span class="mbr-batch-picker-option-label">{{ item.label }}</span>
        <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
      </button>
    </template>
    <div v-if="ctx.mobileBatchMenuItems.value.length === 0" class="mbr-batch-picker-empty">
      <i class="pi pi-info-circle" aria-hidden="true" />
      <span>当前章节没有可执行的批量操作。</span>
    </div>
  </MobileBottomSheet>
</template>
