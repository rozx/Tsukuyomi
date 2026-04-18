<script setup lang="ts">
/**
 * Device-variant dispatcher for the book details page.
 *
 * - Calls `provideBookDetailsPage()` ONCE so lifecycle side effects (content loading,
 *   embedding subscriptions, keyboard shortcuts, route watchers) run once per page
 *   navigation. Variants obtain the same state via `injectBookDetailsPage()`.
 * - Renders all global page chrome (dialogs, popovers, export menu) here so they are
 *   shared across variants without duplication.
 * - `<component :is>` mounts one of Desktop / Tablet / Mobile based on `useDeviceVariant()`.
 */
import { computed } from 'vue';
import TieredMenu from 'primevue/tieredmenu';
import Popover from 'primevue/popover';
import ProgressSpinner from 'primevue/progressspinner';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import CharacterEditDialog from 'src/components/dialogs/CharacterEditDialog.vue';
import AddVolumeDialog from 'src/components/dialogs/AddVolumeDialog.vue';
import AddChapterDialog from 'src/components/dialogs/AddChapterDialog.vue';
import EditVolumeDialog from 'src/components/dialogs/EditVolumeDialog.vue';
import EditChapterDialog from 'src/components/dialogs/EditChapterDialog.vue';
import DeleteVolumeConfirmDialog from 'src/components/dialogs/DeleteVolumeConfirmDialog.vue';
import DeleteChapterConfirmDialog from 'src/components/dialogs/DeleteChapterConfirmDialog.vue';
import DeleteTermConfirmDialog from 'src/components/dialogs/DeleteTermConfirmDialog.vue';
import DeleteCharacterConfirmDialog from 'src/components/dialogs/DeleteCharacterConfirmDialog.vue';
import TermPopover from 'src/components/novel/TermPopover.vue';
import CharacterPopover from 'src/components/novel/CharacterPopover.vue';
import MemoryReferencePanel from 'src/components/novel/MemoryReferencePanel.vue';
import MemoryDetailDialog from 'src/components/novel/MemoryDetailDialog.vue';
import KeyboardShortcutsPopover from 'src/components/novel/KeyboardShortcutsPopover.vue';
import ChapterSettingsPopover from 'src/components/novel/ChapterSettingsPopover.vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import BookDetailsDesktop from './book-details/BookDetailsDesktop.vue';
import BookDetailsTablet from './book-details/BookDetailsTablet.vue';
import BookDetailsMobile from './book-details/BookDetailsMobile.vue';

const ctx = provideBookDetailsPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return BookDetailsMobile;
    case 'tablet':
      return BookDetailsTablet;
    case 'desktop':
    default:
      return BookDetailsDesktop;
  }
});
</script>

<template>
  <div class="book-details-layout">
    <!-- 加载指示器 -->
    <div v-if="!ctx.book.value" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <ProgressSpinner
          style="width: 50px; height: 50px"
          stroke-width="4"
          animation-duration=".8s"
          aria-label="加载中"
        />
        <p class="text-moon/70 mt-4">正在加载书籍信息...</p>
      </div>
    </div>

    <!-- 变体内容 -->
    <div
      v-else
      class="book-details-layout"
      :class="{ 'is-phone': ctx.isPhone.value }"
    >
      <component :is="variantComponent" />

      <!-- 共享对话框与 Popover（无论变体都需要） -->
      <AddVolumeDialog
        v-model:visible="ctx.showAddVolumeDialog.value"
        :loading="ctx.isAddingVolume.value"
        @save="ctx.handleAddVolume"
      />
      <AddChapterDialog
        v-model:visible="ctx.showAddChapterDialog.value"
        :volume-options="ctx.volumeOptions.value"
        :loading="ctx.isAddingChapter.value"
        @save="ctx.handleAddChapter"
      />
      <EditVolumeDialog
        v-model:visible="ctx.showEditVolumeDialog.value"
        :title="ctx.editingVolumeTitle.value"
        :translation="ctx.editingVolumeTranslation.value"
        :loading="ctx.isEditingVolume.value"
        @save="ctx.handleEditVolume"
      />
      <EditChapterDialog
        v-model:visible="ctx.showEditChapterDialog.value"
        :title="ctx.editingChapterTitle.value || ''"
        :translation="ctx.editingChapterTranslation.value || ''"
        :target-volume-id="ctx.editingChapterTargetVolumeId.value || null"
        :volume-options="ctx.volumeOptions.value"
        :loading="ctx.isEditingChapter.value"
        :web-url="ctx.editingChapterWebUrl.value || ''"
        :last-updated="ctx.editingChapterLastUpdated.value"
        :last-edited="ctx.editingChapterLastEdited.value"
        :created-at="ctx.editingChapterCreatedAt.value"
        :translation-instructions="ctx.editingChapterTranslationInstructions.value || ''"
        :polish-instructions="ctx.editingChapterPolishInstructions.value || ''"
        :proofreading-instructions="ctx.editingChapterProofreadingInstructions.value || ''"
        @save="ctx.handleEditChapter"
      />
      <DeleteVolumeConfirmDialog
        v-model:visible="ctx.showDeleteVolumeConfirm.value"
        :volume-title="ctx.deletingVolumeTitle.value"
        :loading="ctx.isDeletingVolume.value"
        @confirm="ctx.handleDeleteVolume"
      />
      <DeleteChapterConfirmDialog
        v-model:visible="ctx.showDeleteChapterConfirm.value"
        :chapter-title="ctx.deletingChapterTitle.value"
        :loading="ctx.isDeletingChapter.value"
        @confirm="ctx.handleDeleteChapter"
      />
      <BookDialog
        v-model:visible="ctx.showBookDialog.value"
        mode="edit"
        :book="ctx.book.value || null"
        :loading="ctx.isSavingBook.value"
        @save="ctx.handleBookSave"
        @cancel="ctx.showBookDialog.value = false"
      />
      <NovelScraperDialog
        v-model:visible="ctx.showScraperDialog.value"
        :current-book="ctx.book.value || null"
        :initial-url="ctx.book.value?.webUrl?.[0] || ''"
        :show-novel-info="false"
        initial-filter="unimported"
        @apply="ctx.handleScraperUpdate"
      />

      <!-- 导出菜单 + Popovers -->
      <TieredMenu ref="exportMenuRef" :model="ctx.exportMenuItems.value" popup />

      <TermPopover
        ref="termPopover"
        :used-terms="ctx.usedTerms.value"
        @edit="ctx.openEditTermDialog"
        @delete="ctx.openDeleteTermConfirm"
        @create="ctx.openCreateTermDialog"
      />

      <CharacterPopover
        ref="characterPopover"
        :used-characters="ctx.usedCharacters.value"
        @edit="ctx.openEditCharacterDialog"
        @delete="ctx.openDeleteCharacterConfirm"
        @create="ctx.openCreateCharacterDialog"
      />

      <Popover
        ref="memoryPopover"
        :dismissable="true"
        :show-close-icon="false"
        style="width: 24rem; max-width: 90vw"
        class="memory-reference-popover"
        @show="ctx.handleMemoryPopoverShow"
        @hide="ctx.handleMemoryPopoverHide"
      >
        <MemoryReferencePanel
          :references="ctx.usedMemoryReferences.value"
          :book-id="ctx.bookId.value"
          :loading="ctx.isLoadingMemoryReferences.value"
          :always-expanded="true"
          :score-breakdowns="ctx.mergedScoreBreakdowns.value"
          @view-memory="ctx.handleViewMemory"
        />
      </Popover>

      <KeyboardShortcutsPopover ref="keyboardShortcutsPopover" />

      <ChapterSettingsPopover
        ref="chapterSettingsPopover"
        :book="ctx.book.value || null"
        :chapter="ctx.selectedChapter.value || null"
        @save="ctx.handleSaveChapterSettings"
      />

      <MemoryDetailDialog
        v-if="ctx.bookId.value"
        :visible="ctx.showMemoryDetailDialog.value"
        :memory="ctx.detailMemory.value"
        :book-id="ctx.bookId.value"
        @update:visible="(val) => (ctx.showMemoryDetailDialog.value = val)"
        @save="ctx.handleMemorySave"
        @delete="ctx.handleMemoryDelete"
      />

      <TermEditDialog
        v-model:visible="ctx.showEditTermDialog.value"
        :mode="ctx.termDialogMode.value"
        :term="ctx.editingTerm.value"
        :loading="ctx.isSavingTerm.value"
        @save="ctx.handleSaveTerm"
      />

      <DeleteTermConfirmDialog
        v-model:visible="ctx.showDeleteTermConfirm.value"
        :term-name="ctx.deletingTerm.value?.name || null"
        :loading="ctx.isDeletingTerm.value"
        @confirm="ctx.confirmDeleteTerm"
      />

      <CharacterEditDialog
        v-model:visible="ctx.showEditCharacterDialog.value"
        :character="ctx.editingCharacter.value"
        :loading="ctx.isSavingCharacter.value"
        @save="ctx.handleSaveCharacter"
      />

      <DeleteCharacterConfirmDialog
        v-model:visible="ctx.showDeleteCharacterConfirm.value"
        :character-name="ctx.deletingCharacter.value?.name || null"
        :loading="ctx.isDeletingCharacter.value"
        @confirm="ctx.confirmDeleteCharacter"
      />
    </div>
  </div>
</template>

<style scoped>
.book-details-layout {
  display: flex;
  height: 100%;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.book-details-layout.is-phone {
  flex-direction: column;
  overflow: hidden;
}
</style>
