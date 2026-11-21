<script setup lang="ts">
/**
 * 导入三步里正在查看那一步的主按钮（让月詠整理 / 暂停 / 生成导入方案），三端共用。
 * 导入方案页自带确认导入，不渲染；按钮不可点时上方说明原因。定位（贴底等）由宿主决定。
 */
import { IMPORT_ACTION_ICONS, useImportFlow } from 'src/composables/import-page/useImportFlow';

const { action, actionHint, actionLabel, runAction } = useImportFlow();
</script>

<template>
  <footer v-if="action" class="isf">
    <div class="isf-inner">
      <p v-if="actionHint" class="isf-hint">{{ actionHint }}</p>
      <button
        type="button"
        class="ui-btn ui-btn--primary isf-cta"
        :disabled="action.disabled"
        @click="runAction"
      >
        <i :class="IMPORT_ACTION_ICONS[action.kind]" aria-hidden="true" />{{ actionLabel }}
      </button>
    </div>
  </footer>
</template>

<style scoped>
.isf {
  container-type: inline-size;
  padding: 10px 16px;
  background: rgba(10, 12, 15, 0.86);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--white-opacity-6);
}

.isf-hint {
  margin: 0 0 8px;
  font-size: 12px;
  text-align: center;
  color: var(--moon-50-opacity-60);
}

.isf-cta {
  width: 100%;
  min-height: 44px;
  font-size: 0.95rem;
}

.isf-cta:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 宽（桌面 / 平板工作区）：按钮靠右、不拉满，说明在左侧同一行 */
@container (min-width: 36rem) {
  .isf-inner {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .isf-hint {
    flex: 1;
    margin: 0;
    text-align: left;
  }

  .isf-cta {
    width: auto;
    min-width: 13rem;
  }
}
</style>
