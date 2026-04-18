<script setup lang="ts">
/**
 * Mobile fallback — chat lives in a bottom-sheet on mobile, not a dedicated
 * page. Redirect back to home and open the chat sheet (via `ui.rightPanelOpen`
 * + `activeRightTab='chat'`, which MainLayoutMobile forwards to MobileChatSheet).
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
