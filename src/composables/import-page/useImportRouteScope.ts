import { computed } from 'vue';
import { useRoute } from 'vue-router';

/**
 * 是否处于 AI 导入路由。布局的聊天槽位据此挂载导入聊天外壳或普通月詠聊天
 * （路由范围选择，与设备变体选择无关）。
 */
export function useImportRouteScope() {
  const route = useRoute();
  return computed(() => route.path === '/import' || route.path.startsWith('/import/'));
}
