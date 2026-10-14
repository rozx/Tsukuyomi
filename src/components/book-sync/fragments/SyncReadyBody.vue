<script setup lang="ts">
/**
 * 检查完成后的主体（桌面与手机共用同一顺序）：
 * 新书信息 → 检查结论 → 失败 → 新章节 → 原文有修订 → 已跳过。
 * 多根片段，直接参与外层列布局的间距。
 */
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import NewBookInfo from './NewBookInfo.vue';
import SyncVerdict from './SyncVerdict.vue';
import FailedList from './FailedList.vue';
import NewChapterGroups from './NewChapterGroups.vue';
import UpdatedChapterList from './UpdatedChapterList.vue';
import SkippedList from './SkippedList.vue';

const { target } = injectBookSync();
</script>

<template>
  <NewBookInfo />
  <SyncVerdict />
  <FailedList />
  <NewChapterGroups />
  <UpdatedChapterList v-if="target && 'bookId' in target" />
  <SkippedList />
</template>
