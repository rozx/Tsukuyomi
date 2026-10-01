<script setup lang="ts">
/**
 * 导入路由的聊天外壳（桌面右栏 / 平板停靠栏 / 手机「对话」分区）。由宿主按路由挂载，
 * 替代而非叠加普通月詠聊天，因此任一断点只有一个聊天控制器。导入以对话为核心，
 * 外壳常驻，不提供关闭。
 */
import { useI18n } from 'vue-i18n';
import ImportChatHeader from './ImportChatHeader.vue';
import ImportChatBody from './ImportChatBody.vue';

withDefaults(defineProps<{ safeArea?: boolean }>(), { safeArea: false });
const { t } = useI18n();
</script>

<template>
  <section class="icp-shell" :aria-label="t('importUi.chat.region')">
    <ImportChatHeader />
    <ImportChatBody :safe-area="safeArea" />
  </section>
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
