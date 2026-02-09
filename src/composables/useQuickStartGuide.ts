import { ref, watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';

export function useQuickStartGuide() {
  const settingsStore = useSettingsStore();
  const quickStartGuideVisible = ref(false);
  const isPersistingDismiss = ref(false);

  watch(
    [() => settingsStore.isLoaded, () => settingsStore.settings.quickStartDismissed],
    ([isLoaded, quickStartDismissed]) => {
      if (!isLoaded) {
        return;
      }
      quickStartGuideVisible.value = !quickStartDismissed;
    },
    { immediate: true },
  );

  const dismissQuickStartGuide = async (): Promise<void> => {
    if (isPersistingDismiss.value) {
      return;
    }

    quickStartGuideVisible.value = false;

    if (settingsStore.settings.quickStartDismissed) {
      return;
    }

    isPersistingDismiss.value = true;
    try {
      await settingsStore.setQuickStartDismissed(true);
    } catch (error) {
      console.error('Failed to persist quick start dismissed state:', error);
    } finally {
      isPersistingDismiss.value = false;
    }
  };

  return {
    quickStartGuideVisible,
    dismissQuickStartGuide,
  };
}
