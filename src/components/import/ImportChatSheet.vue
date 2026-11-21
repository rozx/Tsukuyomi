<script setup lang="ts">
/**
 * 手机导入路由的月詠对话抽屉：替代普通月詠抽屉（同一个开关：ui 的右侧面板 + chat），
 * 底部栏「月詠」与任务顶部的月詠预览都打开它。输入草稿按任务保存在对话状态里，关闭后不丢。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import ImportChatHeader from './ImportChatHeader.vue';
import ImportChatBody from './ImportChatBody.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();
const { t } = useI18n();

const localVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});
</script>

<template>
  <MobileBottomSheet
    v-model:visible="localVisible"
    :title="t('importUi.chat.title')"
    :close-label="t('importUi.chat.close')"
    min-height="88dvh"
    max-height="92dvh"
    full-bleed
  >
    <template #header="{ close }">
      <div class="ics-head">
        <ImportChatHeader class="ics-head-main" />
        <button
          type="button"
          class="ics-close"
          :aria-label="t('importUi.chat.close')"
          @click="close"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </div>
    </template>
    <div class="ics-body">
      <ImportChatBody safe-area />
    </div>
  </MobileBottomSheet>
</template>

<style scoped>
.ics-head {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ics-head-main {
  flex: 1;
  min-width: 0;
}

/* 分隔线由外层统一画，标题栏自身不再画底线 */
.ics-head :deep(.icb-appbar) {
  border-bottom: none;
}

.ics-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  margin-right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--moon-50-opacity-70);
}

.ics-close:active {
  background: var(--white-opacity-6);
}

/* 抽屉正文是纵向 flex 容器：用 flex 撑满（百分比高度在这里不生效） */
.ics-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ics-body > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
