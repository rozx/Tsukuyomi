<script setup lang="ts">
/**
 * Desktop fallback — chat lives in the right-panel on desktop, not as a
 * dedicated page. If a tablet user navigates here then the viewport widens to
 * desktop (e.g. sidebar collapses), we redirect back to home and open the
 * chat tab in the right panel to preserve the desktop UX.
 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

const router = useRouter();
const ui = useUiStore();

onMounted(() => {
  ui.setActiveRightTab('chat');
  if (!ui.rightPanelOpen) ui.openRightPanel();
  void router.replace('/');
});
</script>

<template>
  <div class="w-full h-full" />
</template>
