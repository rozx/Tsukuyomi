<script setup lang="ts">
/**
 * 章节 / 书籍翻译设置面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `ChapterSettingsBody`。
 *
 * 桌面弹窗只承载章节级指令（showGlobalTab=false，书籍级设置在侧栏「翻译设置」面板）；
 * 手机抽屉保留「全局设置+章节设置」双 tab（showGlobalTab=true）。
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
import type { ChapterSettingsFormData as SavePayload } from 'src/composables/book-details/chapter-settings-update';

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
        :show-global-tab="false"
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
      :show-global-tab="true"
      @save="handleSave"
      @close="closeShell"
    />
  </MobileBottomSheet>
</template>
