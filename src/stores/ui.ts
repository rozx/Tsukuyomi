import { defineStore, acceptHMRUpdate } from 'pinia';
import {
  DEFAULT_BOOK_WORKSPACE_MODE,
  getDeviceTypeByWidth,
  type BookWorkspaceMode,
  type DeviceType,
} from 'src/constants/responsive';

const STORAGE_KEY = 'tsukuyomi-ui-state';

/**
 * 尽量在 store 初始化时就给出正确的 deviceType，避免首次渲染
 * （早于 useResponsiveLayout 跑）时把手机当成 desktop，导致 QuickStartGuideDialog
 * 等 AdaptiveDialog 消费者短暂以桌面 Dialog 形式挂载，再被 teleport 切换为手机
 * BottomSheet 时 transition 已过，出现"首次没有底部弹层"的观感。
 */
function detectInitialDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  return getDeviceTypeByWidth(window.innerWidth);
}

type ActiveRightTab = 'chat' | 'progress';

function isActiveRightTab(value: unknown): value is ActiveRightTab {
  return value === 'chat' || value === 'progress';
}

/**
 * 从 localStorage 加载 UI 状态
 */
function loadUiStateFromStorage(): {
  sideMenuOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  bookWorkspaceMode: BookWorkspaceMode;
  bookSettingsMenuExpanded: boolean;
  activeRightTab: ActiveRightTab;
} {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      return {
        sideMenuOpen: state.sideMenuOpen ?? true,
        rightPanelOpen: state.rightPanelOpen ?? false,
        rightPanelWidth: state.rightPanelWidth ?? 384, // 默认 384px (w-96)
        bookWorkspaceMode: state.bookWorkspaceMode ?? DEFAULT_BOOK_WORKSPACE_MODE,
        bookSettingsMenuExpanded: state.bookSettingsMenuExpanded ?? true,
        activeRightTab: isActiveRightTab(state.activeRightTab) ? state.activeRightTab : 'chat',
      };
    }
  } catch (error) {
    console.error('Failed to load UI state from storage:', error);
  }
  return {
    sideMenuOpen: true,
    rightPanelOpen: false,
    rightPanelWidth: 384, // 默认 384px (w-96)
    bookWorkspaceMode: DEFAULT_BOOK_WORKSPACE_MODE,
    bookSettingsMenuExpanded: true,
    activeRightTab: 'chat',
  };
}

/**
 * 保存 UI 状态到 localStorage
 */
function saveUiStateToStorage(state: {
  sideMenuOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  bookWorkspaceMode: BookWorkspaceMode;
  bookSettingsMenuExpanded: boolean;
  activeRightTab: ActiveRightTab;
}): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save UI state to storage:', error);
  }
}

export const useUiStore = defineStore('ui', {
  state: (): {
    sideMenuOpen: boolean;
    rightPanelOpen: boolean;
    rightPanelWidth: number;
    deviceType: DeviceType;
    bookWorkspaceMode: BookWorkspaceMode;
    bookSettingsMenuExpanded: boolean;
    isLoaded: boolean;
    isInitialDataLoading: boolean;
    assistantInputMessage: string | null; // 要复制到助手输入框的消息
    activeRightTab: ActiveRightTab; // 右侧面板当前激活的 Tab
  } => ({
    sideMenuOpen: true,
    rightPanelOpen: false,
    rightPanelWidth: 384, // 默认 384px (w-96)
    deviceType: detectInitialDeviceType(),
    bookWorkspaceMode: DEFAULT_BOOK_WORKSPACE_MODE,
    bookSettingsMenuExpanded: true,
    isLoaded: false,
    isInitialDataLoading: false,
    assistantInputMessage: null,
    activeRightTab: 'chat',
  }),

  actions: {
    /**
     * 从 localStorage 加载 UI 状态
     */
    loadState(): void {
      if (this.isLoaded) {
        return;
      }

      const state = loadUiStateFromStorage();
      // 手机端侧栏默认收起：首次进入 / localStorage 里残留的 sideMenuOpen=true
      // 会让 phone-sidebar-wrapper 滑出 + 遮罩盖住整个主区域；桌面切换手机时已有
      // watcher 处理，这里兜住"初始即手机"的场景（watcher 无 immediate，初始值
      // 相同不触发）。
      const phoneOverride = this.deviceType === 'phone';
      this.sideMenuOpen = phoneOverride ? false : state.sideMenuOpen;
      this.rightPanelOpen = phoneOverride ? false : state.rightPanelOpen;
      this.rightPanelWidth = state.rightPanelWidth;
      this.bookWorkspaceMode = state.bookWorkspaceMode;
      this.bookSettingsMenuExpanded = state.bookSettingsMenuExpanded;
      this.activeRightTab = state.activeRightTab;
      this.isLoaded = true;
    },

    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      this.saveState();
    },
    openSideMenu() {
      this.sideMenuOpen = true;
      this.saveState();
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
      this.saveState();
    },
    toggleRightPanel() {
      this.rightPanelOpen = !this.rightPanelOpen;
      this.saveState();
    },
    openRightPanel() {
      this.rightPanelOpen = true;
      this.saveState();
    },
    closeRightPanel() {
      this.rightPanelOpen = false;
      this.saveState();
    },
    setRightPanelWidth(width: number) {
      // 限制宽度范围：最小 256px，最大 1024px
      this.rightPanelWidth = Math.max(256, Math.min(1024, width));
      this.saveState();
    },
    setDeviceType(deviceType: DeviceType) {
      this.deviceType = deviceType;
    },
    setBookWorkspaceMode(mode: BookWorkspaceMode) {
      this.bookWorkspaceMode = mode;
      this.saveState();
    },
    toggleBookSettingsMenu() {
      this.bookSettingsMenuExpanded = !this.bookSettingsMenuExpanded;
      this.saveState();
    },
    saveState() {
      saveUiStateToStorage({
        sideMenuOpen: this.sideMenuOpen,
        rightPanelOpen: this.rightPanelOpen,
        rightPanelWidth: this.rightPanelWidth,
        bookWorkspaceMode: this.bookWorkspaceMode,
        bookSettingsMenuExpanded: this.bookSettingsMenuExpanded,
        activeRightTab: this.activeRightTab,
      });
    },
    setInitialDataLoading(loading: boolean) {
      this.isInitialDataLoading = loading;
    },
    /**
     * 设置要复制到助手输入框的消息
     * @param message 要设置的消息，设置为 null 可清除
     */
    setAssistantInputMessage(message: string | null) {
      this.assistantInputMessage = message;
    },
    setActiveRightTab(tab: ActiveRightTab) {
      this.activeRightTab = tab;
      this.saveState();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
