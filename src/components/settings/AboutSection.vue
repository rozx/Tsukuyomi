<script setup lang="ts">
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import DesktopUpdateSection from './DesktopUpdateSection.vue';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import { APP_DISPLAY_VERSION } from 'src/constants/build-info';
import { useI18n } from 'vue-i18n';
import { useIssueReportUrl } from 'src/composables/useIssueReportUrl';
import { PROJECT_REPO_URL } from 'src/utils/project-links';

const { t } = useI18n();

const version = APP_DISPLAY_VERSION;
const githubUrl = PROJECT_REPO_URL;
const issueReportUrl = useIssueReportUrl();
const authorUrl = 'https://github.com/rozx';
const author = 'Rozx';
</script>

<template>
  <SettingsPanel>
    <SettingsSection>
      <div class="about-section">
        <AssistantAvatar :size="128" glowing class="about-avatar" />
        <h2 class="about-title">月詠 · Tsukuyomi</h2>
        <p class="about-tagline">{{ t('settingsUi.about.tagline') }}</p>
        <p class="about-version">v{{ version }}</p>
        <DesktopUpdateSection />

        <div class="about-meta">
          <div class="about-meta-row">
            <span class="about-meta-label">{{ t('settingsUi.about.author') }}</span>
            <a class="about-meta-link" :href="authorUrl" target="_blank" rel="noopener noreferrer">
              <i class="pi pi-user" aria-hidden="true" />
              <span>{{ author }}</span>
              <i class="pi pi-external-link about-meta-extico" aria-hidden="true" />
            </a>
          </div>
          <div class="about-meta-row">
            <span class="about-meta-label">{{ t('settingsUi.about.repository') }}</span>
            <a class="about-meta-link" :href="githubUrl" target="_blank" rel="noopener noreferrer">
              <i class="pi pi-github" aria-hidden="true" />
              <span>github.com/rozx/Tsukuyomi</span>
              <i class="pi pi-external-link about-meta-extico" aria-hidden="true" />
            </a>
          </div>
          <div class="about-meta-row">
            <span class="about-meta-label">{{ t('settingsUi.about.feedback') }}</span>
            <a
              class="about-meta-link"
              :href="issueReportUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="pi pi-megaphone" aria-hidden="true" />
              <span>{{ t('libraryUi.reportIssue') }}</span>
              <i class="pi pi-external-link about-meta-extico" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div class="about-star">
          <p class="about-star-text">{{ t('settingsUi.about.starPrompt') }}</p>
          <a class="about-star-action" :href="githubUrl" target="_blank" rel="noopener noreferrer">
            <i class="pi pi-star" aria-hidden="true" />
            <span>{{ t('settingsUi.about.starAction') }}</span>
          </a>
        </div>
      </div>
    </SettingsSection>
  </SettingsPanel>
</template>

<style scoped>
.about-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 1.6rem 0.5rem 1.8rem;
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
  color: var(--moon-200);
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

.about-star {
  margin-top: 0.9rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: min(100%, 320px);
  padding: 1rem 1rem 1.1rem;
  background: rgba(234, 192, 123, 0.05);
  border: 1px solid rgba(234, 192, 123, 0.16);
  border-radius: 12px;
}

.about-star-text {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.65;
  color: var(--moon-50-opacity-70);
}

.about-star-action {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(234, 192, 123, 0.35);
  background: rgba(234, 192, 123, 0.1);
  color: rgba(234, 192, 123, 0.95);
  font-size: 0.8rem;
  font-weight: 500;
  text-decoration: none;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.about-star-action:hover {
  background: rgba(234, 192, 123, 0.18);
  border-color: rgba(234, 192, 123, 0.55);
}

.about-star-action .pi-star {
  font-size: 0.85rem;
}
</style>
