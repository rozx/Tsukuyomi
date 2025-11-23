<script setup lang="ts">
import { APP_VERSION } from 'src/constants/version';
</script>

<template>
  <footer class="border-t border-white/10 py-3 text-xs text-moon/70 shrink-0">
    <div class="px-3 flex items-center justify-between">
      <span>© 2025 Luna AI Translator v{{ APP_VERSION }}</span>
      <a
        href="https://github.com/rozx"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit Rozx on GitHub"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
      >
        <i class="pi pi-github text-[0.9em]" />
        <span>By Rozx</span>
      </a>
    </div>
  </footer>
</template>
