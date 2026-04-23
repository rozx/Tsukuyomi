<script setup lang="ts">
import { APP_VERSION } from 'src/constants/version';
import { APP_NAME } from 'src/constants/app';
</script>

<template>
  <footer class="dsk-statusbar">
    <div class="dsk-statusbar-left">
      <span class="dsk-statusbar-brand">{{ APP_NAME.en }} {{ APP_NAME.zh }}</span>
      <span class="dsk-statusbar-dot" aria-hidden="true" />
      <span class="dsk-statusbar-tagline">{{ APP_NAME.description.en }}</span>
    </div>

    <div class="dsk-statusbar-center">
      <span class="dsk-statusbar-copy">© 2026 Tsukuyomi</span>
    </div>

    <div class="dsk-statusbar-right">
      <span class="dsk-statusbar-version">v{{ APP_VERSION }}</span>
      <a
        href="https://github.com/rozx/Tsukuyomi"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit Tsukuyomi on GitHub"
        class="dsk-statusbar-github"
      >
        <i class="pi pi-github" aria-hidden="true" />
        <span>By Rozx</span>
      </a>
    </div>
  </footer>
</template>

<style scoped>
.dsk-statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 20px;
  min-height: 26px;
  background: rgba(8, 10, 13, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid var(--white-opacity-4);
  flex-shrink: 0;
  position: relative;
  z-index: 20;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
}

.dsk-statusbar-left,
.dsk-statusbar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dsk-statusbar-left {
  flex: 1;
  min-width: 0;
}

.dsk-statusbar-center {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.dsk-statusbar-right {
  flex: 1;
  justify-content: flex-end;
}

.dsk-statusbar-brand {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(155, 164, 179, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsk-statusbar-tagline {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 400;
  color: rgba(174, 183, 198, 0.4);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsk-statusbar-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(174, 183, 198, 0.3);
  flex-shrink: 0;
}

.dsk-statusbar-copy {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 400;
  color: rgba(174, 183, 198, 0.38);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.dsk-statusbar-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  color: rgba(163, 183, 207, 0.55);
  letter-spacing: 0.02em;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(109, 136, 168, 0.08);
  border: 1px solid rgba(109, 136, 168, 0.18);
  white-space: nowrap;
}

.dsk-statusbar-github {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid transparent;
  color: rgba(192, 198, 209, 0.7);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-decoration: none;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dsk-statusbar-github i {
  font-size: 11px;
  line-height: 1;
  color: rgba(174, 183, 198, 0.6);
  transition: color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dsk-statusbar-github:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--white-opacity-8);
  color: rgba(247, 244, 236, 1);
}

.dsk-statusbar-github:hover i {
  color: rgba(247, 244, 236, 0.9);
}
</style>
