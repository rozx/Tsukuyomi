<script setup lang="ts">
/**
 * 章节 / 书籍翻译设置面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `ChapterSettingsBody`。
 *
 * 对外仍保留 `toggle(event)` / `hide()` API，兼容书籍详情页里对
 * `chapterSettingsPopoverRef.value?.toggle(event)` 的调用。
 */
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import ChapterSettingsBody from './ChapterSettingsBody.vue';
import type { Novel, Chapter } from 'src/models/novel';

type SavePayload = {
  preserveIndents?: boolean;
  normalizeSymbolsOnDisplay?: boolean;
  normalizeTitleOnDisplay?: boolean;
  translationChunkSize?: number;
  skipAskUser?: boolean;
  enableOriginalTextValidation?: boolean;
  translationInstructions?: string;
  polishInstructions?: string;
  proofreadingInstructions?: string;
};

defineProps<{
  book: Novel | null;
  chapter: Chapter | null;
}>();

const emit = defineEmits<{
  (e: 'save', data: SavePayload): void;
}>();

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

const popover = ref<InstanceType<typeof Popover> | null>(null);
const mobileVisible = ref(false);

const closeShell = () => {
  if (isPhone.value) {
    mobileVisible.value = false;
  } else {
    popover.value?.hide();
  }
};

const handleSave = (data: SavePayload) => {
  emit('save', data);
};

defineExpose({
  popover,
  toggle: (event: Event) => {
    if (isPhone.value) {
      mobileVisible.value = !mobileVisible.value;
    } else {
      popover.value?.toggle(event);
    }
  },
  hide: closeShell,
});
</script>

<template>
  <Popover v-if="!isPhone" ref="popover" style="width: 32rem; max-width: 90vw">
    <div class="h-[600px] overflow-hidden">
      <ChapterSettingsBody
        :book="book"
        :chapter="chapter"
        @save="handleSave"
        @close="closeShell"
      />
    </div>
  </Popover>

  <MobileBottomSheet
    v-else
    v-model:visible="mobileVisible"
    title="翻译设置"
    eyebrow="CHAPTER · 设置"
    max-height="86dvh"
  >
    <ChapterSettingsBody
      :book="book"
      :chapter="chapter"
      @save="handleSave"
      @close="closeShell"
    />
  </MobileBottomSheet>
</template>
