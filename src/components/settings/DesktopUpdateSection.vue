<template>
  <div v-if="available" class="desktop-update-section" aria-live="polite">
    <p>
      {{ t(`settingsUi.update.phase.${state.phase}`)
      }}<span v-if="state.targetVersion"> · v{{ state.targetVersion }}</span>
    </p>
    <progress
      v-if="state.phase === 'downloading'"
      :value="state.progress ?? 0"
      max="100"
      :aria-label="t('settingsUi.update.progress')"
    />
    <p v-if="state.message" class="update-message">{{ state.message }}</p>
    <div class="update-actions">
      <Button
        v-if="state.phase === 'ready'"
        :label="t('settingsUi.update.restart')"
        size="small"
        @click="restart"
      />
      <Button
        v-else
        :label="t('settingsUi.update.check')"
        size="small"
        outlined
        :disabled="busy || state.phase === 'unavailable'"
        @click="check"
      />
      <a
        href="https://github.com/rozx/Tsukuyomi/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        >{{ t('settingsUi.update.releases') }}</a
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import { useDesktopUpdates } from 'src/composables/useDesktopUpdates';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { state, available, busy, check, restart } = useDesktopUpdates();
</script>

<style scoped>
.desktop-update-section {
  width: min(100%, 420px);
  font-size: 0.85rem;
}
.update-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.75rem;
}
.update-message {
  color: var(--moon-50-opacity-70);
  overflow-wrap: anywhere;
}
progress {
  width: 100%;
}
</style>
