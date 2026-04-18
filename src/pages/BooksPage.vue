<script setup lang="ts">
/**
 * Device-variant dispatcher for the books list page.
 * Provides BooksPage context once; mounts Desktop / Tablet / Mobile variant and
 * renders the shared dialogs + sort menu.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ConfirmDialog from 'primevue/confirmdialog';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideBooksPage } from 'src/composables/books-page/useBooksPage';
import BooksPageDesktop from './books-page/BooksPageDesktop.vue';
import BooksPageTablet from './books-page/BooksPageTablet.vue';
import BooksPageMobile from './books-page/BooksPageMobile.vue';

const ctx = provideBooksPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return BooksPageMobile;
    case 'tablet':
      return BooksPageTablet;
    case 'desktop':
    default:
      return BooksPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />

  <!-- Shared dialogs + menus (mounted once by dispatcher) -->
  <BookDialog
    v-model:visible="ctx.showAddDialog.value"
    mode="add"
    @save="ctx.handleSave"
    @cancel="ctx.showAddDialog.value = false"
  />

  <BookDialog
    v-model:visible="ctx.showEditDialog.value"
    mode="edit"
    :book="ctx.selectedBook.value"
    @save="ctx.handleSave"
    @cancel="ctx.showEditDialog.value = false"
  />

  <NovelScraperDialog
    v-model:visible="ctx.showImportDialog.value"
    :current-book="null"
    @apply="ctx.handleImportBook"
  />

  <ConfirmDialog />

  <!-- 删除确认对话框 -->
  <AdaptiveDialog
    v-model:visible="ctx.showDeleteConfirm.value"
    header="确认删除"
    desktop-width="30rem"
    eyebrow="DELETE"
    dialog-class="delete-confirm-dialog"
  >
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-2xl text-yellow-400 flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <p class="text-moon/90 mb-2">
            确定要删除书籍
            <strong class="text-moon/95">"{{ ctx.bookToDelete.value?.title }}"</strong> 吗？
          </p>
          <p class="text-sm text-moon/70 mb-4">请在下方的输入框中输入书籍标题以确认删除。</p>
          <div class="space-y-2">
            <label class="block text-sm font-medium text-moon/90">输入书籍标题:</label>
            <InputGroup class="w-full">
              <InputText
                v-model="ctx.deleteConfirmInput.value"
                :placeholder="ctx.bookToDelete.value?.title"
                class="flex-1"
                autofocus
                @keyup.enter="if (!ctx.isDeleteDisabled.value) ctx.confirmDeleteBook();"
              />
              <InputGroupAddon class="input-action-addon">
                <Button
                  icon="pi pi-copy"
                  class="p-button-text p-button-sm input-action-button"
                  title="复制标题"
                  @click="ctx.copyBookTitle"
                />
              </InputGroupAddon>
            </InputGroup>
            <small class="text-xs text-moon/60 block">
              <i class="pi pi-info-circle mr-1" />
              提示：点击右侧的复制按钮会将标题复制到剪贴板并自动填充到输入框
            </small>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text"
        :disabled="ctx.isDeletingBook.value"
        @click="ctx.cancelDeleteBook"
      />
      <Button
        label="删除"
        icon="pi pi-trash"
        class="p-button-danger"
        :loading="ctx.isDeletingBook.value"
        :disabled="ctx.isDeleteDisabled.value || ctx.isDeletingBook.value"
        @click="ctx.confirmDeleteBook"
      />
    </template>
  </AdaptiveDialog>

  <!-- Sort menu + file input live in the Desktop variant (mobile has neither) -->
</template>

<style scoped>
.delete-confirm-dialog :deep(.p-inputgroup-addon) {
  padding: 0 !important;
  display: flex !important;
  align-items: stretch !important;
  width: auto;
}

.delete-confirm-dialog :deep(.p-inputgroup-addon .p-button) {
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0.5rem !important;
  min-width: 2.5rem;
  margin: 0 !important;
  border-radius: 0 !important;
}
</style>
