<script setup lang="ts">
/**
 * 平板页面的左侧面板开关（书库页的书籍列表、书籍详情页的目录）。
 *
 * 渲染进平板顶部信息条品牌左侧的挂载点 `#tablet-sysbar-leading`：开关状态归页面 composable，
 * 壳层只提供空节点；页面变体卸载时按钮随之消失。`defer` 等同一轮挂载完成再找目标，
 * 页面先于顶部栏挂载时也能找到。
 */
defineProps<{
  open: boolean;
  /** 打开时的标题（如「收起目录」） */
  collapseLabel: string;
  /** 收起时的标题（如「展开目录」） */
  expandLabel: string;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <Teleport to="#tablet-sysbar-leading" defer>
    <button
      type="button"
      class="system-bar-chip tsl-toggle"
      :class="{ 'tsl-toggle--open': open }"
      :title="open ? collapseLabel : expandLabel"
      :aria-label="open ? collapseLabel : expandLabel"
      :aria-pressed="open"
      @click="emit('toggle')"
    >
      <i class="pi" :class="open ? 'pi-angle-double-left' : 'pi-bars'" aria-hidden="true" />
    </button>
  </Teleport>
</template>

<style scoped>
.tsl-toggle {
  width: 32px;
  padding: 0;
  /* 顶部栏左内边距 24px，按钮中心原在 40px；左移 8px 落在 32px，与左侧 64px 导航栏的图标对齐。
     只作用于开关本身，没有开关的页面品牌文字位置不变 */
  margin-left: -8px;
}

.tsl-toggle i {
  font-size: 13px;
  line-height: 1;
}

.tsl-toggle:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
}

.tsl-toggle--open {
  background: rgba(109, 136, 168, 0.14);
  color: #bac9db;
  border-color: rgba(109, 136, 168, 0.28);
}
</style>
