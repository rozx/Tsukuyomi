<script setup lang="ts">
import { APP_VERSION } from 'src/constants/version';
import { APP_NAME } from 'src/constants/app';
</script>

<template>
  <footer class="border-t border-white/10 py-3 text-xs text-moon/60 shrink-0">
    <div class="px-3 flex items-center justify-between gap-3">
      <span class="flex items-center gap-2 min-w-0 truncate">
        <span class="font-ui">© 2025 {{ APP_NAME.en }} {{ APP_NAME.zh }}</span>
        <span class="text-moon/40">·</span>
        <span class="font-display">{{ APP_NAME.description.en }}</span>
        <span class="font-mono text-moon/50">v{{ APP_VERSION }}</span>
      </span>
      <a
        href="https://github.com/rozx/Tsukuyomi"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit Tsukuyomi on GitHub"
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-moon/80 font-medium hover:border-white/20 hover:bg-white/10 hover:text-moon-100 transition-colors"
      >
        <i class="pi pi-github text-[0.9em]" />
        <span>By Rozx</span>
      </a>
    </div>
  </footer>
</template>
