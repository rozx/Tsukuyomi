<script setup lang="ts">
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { APP_VERSION } from 'src/constants/version';

const version = APP_VERSION;
const githubUrl = 'https://github.com/rozx/Tsukuyomi';
const authorUrl = 'https://github.com/rozx';
const author = 'Rozx';
</script>

<template>
  <section class="about-section">
    <AssistantAvatar :size="128" glowing class="about-avatar" />
    <h2 class="about-title">月詠 · Tsukuyomi</h2>
    <p class="about-tagline">月之神官，伴君译笔</p>
    <p class="about-version">v{{ version }}</p>

    <div class="about-meta">
      <div class="about-meta-row">
        <span class="about-meta-label">作者</span>
        <a class="about-meta-link" :href="authorUrl" target="_blank" rel="noopener noreferrer">
          <i class="pi pi-user" aria-hidden="true" />
          <span>{{ author }}</span>
          <i class="pi pi-external-link about-meta-extico" aria-hidden="true" />
        </a>
      </div>
      <div class="about-meta-row">
        <span class="about-meta-label">仓库</span>
        <a class="about-meta-link" :href="githubUrl" target="_blank" rel="noopener noreferrer">
          <i class="pi pi-github" aria-hidden="true" />
          <span>github.com/rozx/Tsukuyomi</span>
          <i class="pi pi-external-link about-meta-extico" aria-hidden="true" />
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.about-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 2.4rem 1.2rem 2.8rem;
  text-align: center;
  width: 100%;
}

.about-avatar {
  margin-bottom: 0.4rem;
}

.about-title {
  font-family: 'Noto Serif JP', 'Songti SC', 'Noto Serif SC', serif;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--primary-200);
  margin: 0;
}

.about-tagline {
  font-family: 'Noto Serif JP', 'Songti SC', 'Noto Serif SC', serif;
  font-size: 0.92rem;
  letter-spacing: 0.14em;
  color: var(--moon-50-opacity-70);
  margin: 0;
}

.about-version {
  font-size: 0.76rem;
  letter-spacing: 0.06em;
  color: var(--moon-50-opacity-50);
  margin: 0.6rem 0 0;
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
}

.about-meta {
  margin-top: 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: min(100%, 320px);
}

.about-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.55rem 0.9rem;
  background: var(--white-opacity-3, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
  border-radius: 10px;
  font-size: 0.82rem;
}

.about-meta-label {
  color: var(--moon-50-opacity-50);
  font-size: 0.74rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.about-meta-value {
  color: var(--moon-90, #e9edf5);
  font-weight: 500;
}

.about-meta-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--primary-200);
  text-decoration: none;
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.78rem;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
}

.about-meta-link:hover {
  color: var(--tsukuyomi-200);
}

.about-meta-link .pi-github {
  font-size: 0.95rem;
  flex-shrink: 0;
}

.about-meta-extico {
  font-size: 0.7rem;
  opacity: 0.55;
  flex-shrink: 0;
}

.about-meta-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
