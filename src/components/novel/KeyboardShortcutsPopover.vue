<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import { ref } from 'vue';
import Popover from 'primevue/popover';

const { t } = useI18n();

const popover = ref<InstanceType<typeof Popover> | null>(null);

// Expose popover ref for parent component to toggle
defineExpose({
  popover,
  toggle: (event: Event) => {
    popover.value?.toggle(event);
  },
  hide: () => {
    popover.value?.hide();
  },
});
</script>

<template>
  <Popover ref="popover" style="width: 28rem; max-width: 90vw">
    <div class="flex flex-col max-h-[70vh] overflow-hidden">
      <div class="p-3 border-b border-white/10">
        <h4 class="font-medium text-moon-100">{{ t('readerUi.shortcuts') }}</h4>
        <p class="text-xs text-moon/60 mt-1">{{ t('readerUi.shortcutsHint') }}</p>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="p-3 flex flex-col gap-4">
          <!-- 搜索相关 -->
          <div class="flex flex-col gap-2">
            <div class="font-ui text-[11px] font-medium text-moon/60 uppercase tracking-[0.2em]">
              {{ t('readerUi.searchReplace') }}
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.toggleFind') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Ctrl+F
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.toggleReplace') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Ctrl+H
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.nextMatch') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  F3
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.prevMatch') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Shift+F3
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.closeSearchToolbar') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Esc
                </kbd>
              </div>
            </div>
          </div>

          <!-- 编辑相关 -->
          <div class="flex flex-col gap-2">
            <div class="font-ui text-[11px] font-medium text-moon/60 uppercase tracking-[0.2em]">
              {{ t('readerUi.editActions') }}
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.undo') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Ctrl+Z
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.redo') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Ctrl+Y
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.copyTranslations') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Ctrl+Shift+C
                </kbd>
              </div>
            </div>
          </div>

          <!-- 导航相关 -->
          <div class="flex flex-col gap-2">
            <div class="font-ui text-[11px] font-medium text-moon/60 uppercase tracking-[0.2em]">
              {{ t('readerUi.paragraphNavigation') }}
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.prevParagraph') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  ↑
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.nextParagraph') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  ↓
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">{{ t('readerUi.editParagraph') }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded">
                  Enter
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Popover>
</template>
