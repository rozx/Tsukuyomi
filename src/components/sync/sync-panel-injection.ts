import type { InjectionKey } from 'vue';

/**
 * 供 SyncStatusBody 关闭父 SyncStatusPanel 的 injection key
 *
 * 使用场景：强制推送前需要先关闭 Popover/BottomSheet，
 * 否则 PrimeVue ConfirmDialog 弹出时父面板仍然可见，操作链路混乱。
 * 若不在 SyncStatusPanel 中使用（如在 SyncSettingsTab），inject 返回 undefined。
 */
export const SyncPanelCloseKey: InjectionKey<() => void> = Symbol('SyncPanelClose');
