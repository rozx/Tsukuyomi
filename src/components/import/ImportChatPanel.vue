<script setup lang="ts">
/**
 * 导入路由的聊天外壳（桌面右栏 / 平板侧滑）。由布局的面板宿主按路由挂载，
 * 替代而非叠加普通月詠聊天，因此任一断点只有一个聊天控制器。
 */
import { useUiStore } from 'src/stores/ui';
import ImportChatHeader from './ImportChatHeader.vue';
import ImportChatBody from './ImportChatBody.vue';

const ui = useUiStore();
</script>

<template>
  <aside class="icp-shell" aria-label="月詠 AI 导入助手">
    <ImportChatHeader @close="ui.closeRightPanel()" />
    <ImportChatBody />
  </aside>
</template>

<style scoped>
.icp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
