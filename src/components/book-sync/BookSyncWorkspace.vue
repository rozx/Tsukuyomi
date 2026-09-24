<script setup lang="ts">
/**
 * 书籍同步工作区 dispatcher（新建与更新共用）：按设备选择变体，并挂载唯一的确认弹窗。
 *
 * 会话状态由外壳所在页面的 dispatcher 调 provideBookSync() 提供（新建页、书籍详情页），
 * 而不是在这里提供：外壳本身也是设备变体，断点切换会整体替换它；状态放在页面层级，
 * 切换时才不会重新检查，也不会丢失勾选与目标卷覆盖。
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import BookSyncWorkspaceDesktop from './BookSyncWorkspaceDesktop.vue';
import BookSyncWorkspaceTablet from './BookSyncWorkspaceTablet.vue';
import BookSyncWorkspaceMobile from './BookSyncWorkspaceMobile.vue';
import ApplyConfirm from './fragments/ApplyConfirm.vue';

const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return BookSyncWorkspaceMobile;
    case 'tablet':
      return BookSyncWorkspaceTablet;
    case 'desktop':
    default:
      return BookSyncWorkspaceDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
  <ApplyConfirm />
</template>
