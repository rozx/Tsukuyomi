<script setup lang="ts">
/**
 * 书籍翻译设置面板（桌面/平板路由面板，/books/:id/settings/translation）。
 * 壳组件：标题区 + 滚动容器 + 共享表单 + 显式保存/取消，
 * 保存复用页面上下文的 handleSaveChapterSettings（payload 仅含书籍级字段，
 * 不会触碰章节指令）。
 */
import { ref } from 'vue';
import Button from 'primevue/button';
import BookTranslationSettingsForm from './BookTranslationSettingsForm.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Novel } from 'src/models/novel';
import type { BookTranslationSettingsFormHandle } from 'src/composables/book-details/chapter-settings-update';

defineProps<{
  book: Novel | null;
}>();

const ctx = injectBookDetailsPage();

const formRef = ref<BookTranslationSettingsFormHandle | null>(null);

const handleSave = async () => {
  const payload = formRef.value?.buildBookLevelPayload();
  if (!payload) return;
  await ctx.handleSaveChapterSettings(payload);
};

const handleCancel = () => {
  formRef.value?.resetFromBook();
};
</script>

<template>
  <div class="book-translation-settings-panel h-full flex flex-col">
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">翻译设置</h1>
      <p class="panel-desc text-sm text-moon/70">
        书籍级翻译行为设置，应用于本书所有章节；章节级特殊指令请在章节工具栏的「章节设置」中配置
      </p>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="panel-body">
        <BookTranslationSettingsForm ref="formRef" :book="book" />
      </div>
    </div>

    <div class="panel-footer border-t border-white/10 flex justify-end gap-2 flex-shrink-0">
      <Button label="取消" class="p-button-text p-button-sm" @click="handleCancel" />
      <Button label="保存" class="p-button-primary p-button-sm" @click="handleSave" />
    </div>
  </div>
</template>

<!-- 标题区样式（五个设置面板共享），详见 panel-header.css -->
<style scoped src="./panel-header.css"></style>

<style scoped>
.panel-body {
  padding: 1rem 1.5rem 1.5rem;
  max-width: 80rem;
}

.panel-footer {
  padding: 0.75rem 1.5rem;
}

@media (max-width: 640px) {
  .panel-body {
    padding: 0.75rem 1rem 1rem;
  }
}
</style>
