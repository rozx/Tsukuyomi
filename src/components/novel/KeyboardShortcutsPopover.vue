<script setup lang="ts">
import { ref } from 'vue';
import Popover from 'primevue/popover';

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
        <h4 class="font-medium text-moon-100">键盘快捷键</h4>
        <p class="text-xs text-moon/60 mt-1">本页面可用的所有快捷键</p>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="p-3 flex flex-col gap-4">
          <!-- 搜索相关 -->
          <div class="flex flex-col gap-2">
            <div class="text-xs font-medium text-moon/70 uppercase tracking-wide">搜索与替换</div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">打开/关闭查找</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Ctrl+F
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">打开/关闭替换</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Ctrl+H
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">下一个匹配</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  F3
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">上一个匹配</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Shift+F3
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">关闭搜索工具栏</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Esc
                </kbd>
              </div>
            </div>
          </div>

          <!-- 编辑相关 -->
          <div class="flex flex-col gap-2">
            <div class="text-xs font-medium text-moon/70 uppercase tracking-wide">编辑操作</div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">撤销</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Ctrl+Z
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">重做</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Ctrl+Y
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">复制所有已翻译文本</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  Ctrl+Shift+C
                </kbd>
              </div>
            </div>
          </div>

          <!-- 导航相关 -->
          <div class="flex flex-col gap-2">
            <div class="text-xs font-medium text-moon/70 uppercase tracking-wide">段落导航</div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">上一个段落</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  ↑
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">下一个段落</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
                  ↓
                </kbd>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-moon-90">开始编辑当前段落</span>
                <kbd
                  class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                >
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

