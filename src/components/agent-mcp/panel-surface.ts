import { inject, provide, type InjectionKey } from 'vue';

const FLAT_PANELS_KEY: InjectionKey<boolean> = Symbol('agent-mcp-flat-panels');

/**
 * 桌面工作台把各分栏内容直接放进同一个工作区，面板不再各自带卡片外框；
 * 手机端仍是一张张独立卡片。由页面变体声明，面板组件自行读取。
 */
export function provideFlatAgentMcpPanels(): void {
  provide(FLAT_PANELS_KEY, true);
}

export function useFlatAgentMcpPanels(): boolean {
  return inject(FLAT_PANELS_KEY, false);
}
