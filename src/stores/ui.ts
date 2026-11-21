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

type ActiveRightTab = 'chat';

/**
 * 持久化的右侧页签只接受 chat：翻译进度已移到 header 任务中心，
 * 旧版本保存的 progress 加载时回退为 chat（右侧面板的开合状态保持不变）。
 */
function isActiveRightTab(value: unknown): value is ActiveRightTab {
  return value === 'chat';
}

/** 旧版本保存的工作区模式（如已移除的 progress）加载时回退为默认值 */
function isBookWorkspaceMode(value: unknown): value is BookWorkspaceMode {
  return value === 'content' || value === 'catalog' || value === 'settings';
}

/** 任务中心固定面板的位置（视口坐标，单位 px） */
export interface TaskCenterPosition {
  x: number;
  y: number;
}

function parseTaskCenterPosition(value: unknown): TaskCenterPosition | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** 任务中心固定面板的尺寸（单位 px）；为空时用默认尺寸 */
export interface TaskCenterSize {
  width: number;
  height: number;
}

function parseTaskCenterSize(value: unknown): TaskCenterSize | null {
  if (!value || typeof value !== 'object') return null;
  const { width, height } = value as { width?: unknown; height?: unknown };
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

/** 跨刷新保留的任务中心界面状态 */
interface TaskCenterUiState {
  taskCenterPinned: boolean;
  taskCenterCollapsed: boolean;
  taskCenterPosition: TaskCenterPosition | null;
  taskCenterSize: TaskCenterSize | null;
  taskCenterExpandedId: string | null;
  taskCenterOtherCollapsed: boolean;
}

const DEFAULT_TASK_CENTER_UI_STATE: TaskCenterUiState = {
  taskCenterPinned: false,
  taskCenterCollapsed: false,
  taskCenterPosition: null,
  taskCenterSize: null,
  taskCenterExpandedId: null,
  taskCenterOtherCollapsed: false,
};

function parseTaskCenterUiState(state: Record<string, unknown>): TaskCenterUiState {
  const pinned = state.taskCenterPinned === true;
  return {
    taskCenterPinned: pinned,
    taskCenterCollapsed: pinned && state.taskCenterCollapsed === true,
    taskCenterPosition: parseTaskCenterPosition(state.taskCenterPosition),
    taskCenterSize: parseTaskCenterSize(state.taskCenterSize),
    taskCenterExpandedId:
      typeof state.taskCenterExpandedId === 'string' ? state.taskCenterExpandedId : null,
    taskCenterOtherCollapsed: state.taskCenterOtherCollapsed === true,
  };
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
} & TaskCenterUiState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      return {
        sideMenuOpen: state.sideMenuOpen ?? true,
        rightPanelOpen: state.rightPanelOpen ?? false,
        rightPanelWidth: state.rightPanelWidth ?? 384, // 默认 384px (w-96)
        bookWorkspaceMode: isBookWorkspaceMode(state.bookWorkspaceMode)
          ? state.bookWorkspaceMode
          : DEFAULT_BOOK_WORKSPACE_MODE,
        bookSettingsMenuExpanded: state.bookSettingsMenuExpanded ?? true,
        activeRightTab: isActiveRightTab(state.activeRightTab) ? state.activeRightTab : 'chat',
        ...parseTaskCenterUiState(state),
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
    ...DEFAULT_TASK_CENTER_UI_STATE,
  };
}

/**
 * 保存 UI 状态到 localStorage
 */
function saveUiStateToStorage(
  state: {
    sideMenuOpen: boolean;
    rightPanelOpen: boolean;
    rightPanelWidth: number;
    bookWorkspaceMode: BookWorkspaceMode;
    bookSettingsMenuExpanded: boolean;
    activeRightTab: ActiveRightTab;
  } & TaskCenterUiState,
): void {
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
    assistantInputMessage: string | null; // 要复制到助手输入框的消息
    activeRightTab: ActiveRightTab; // 右侧面板当前激活的 Tab
    batchEmbeddingsPanelOpen: boolean; // 向量面板跨布局共享，不持久化
  } & TaskCenterUiState => ({
    sideMenuOpen: true,
    rightPanelOpen: false,
    rightPanelWidth: 384, // 默认 384px (w-96)
    deviceType: detectInitialDeviceType(),
    bookWorkspaceMode: DEFAULT_BOOK_WORKSPACE_MODE,
    bookSettingsMenuExpanded: true,
    isLoaded: false,
    assistantInputMessage: null,
    activeRightTab: 'chat',
    batchEmbeddingsPanelOpen: false,
    ...DEFAULT_TASK_CENTER_UI_STATE,
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
      this.taskCenterPinned = state.taskCenterPinned;
      this.taskCenterCollapsed = state.taskCenterCollapsed;
      this.taskCenterPosition = state.taskCenterPosition;
      this.taskCenterSize = state.taskCenterSize;
      this.taskCenterExpandedId = state.taskCenterExpandedId;
      this.taskCenterOtherCollapsed = state.taskCenterOtherCollapsed;
      this.isLoaded = true;
    },

    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      this.saveState();
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
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
        taskCenterPinned: this.taskCenterPinned,
        taskCenterCollapsed: this.taskCenterCollapsed,
        taskCenterPosition: this.taskCenterPosition,
        taskCenterSize: this.taskCenterSize,
        taskCenterExpandedId: this.taskCenterExpandedId,
        taskCenterOtherCollapsed: this.taskCenterOtherCollapsed,
      });
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
    /** 固定 / 取消固定任务中心；取消固定时一并退出收起状态 */
    setTaskCenterPinned(pinned: boolean) {
      this.taskCenterPinned = pinned;
      if (!pinned) this.taskCenterCollapsed = false;
      this.saveState();
    },
    /** 固定面板收起为迷你进度条 / 展开 */
    setTaskCenterCollapsed(collapsed: boolean) {
      this.taskCenterCollapsed = this.taskCenterPinned && collapsed;
      this.saveState();
    },
    setTaskCenterPosition(position: TaskCenterPosition | null) {
      this.taskCenterPosition = position ? { x: position.x, y: position.y } : null;
      this.saveState();
    },
    /** 固定面板尺寸（用户拖动缩放后保存） */
    setTaskCenterSize(size: TaskCenterSize | null) {
      this.taskCenterSize = size ? { width: size.width, height: size.height } : null;
      this.saveState();
    },
    /** 任务中心当前打开详情的任务（队列项或 AI 任务 ID），同一时间最多一个 */
    setTaskCenterExpandedId(id: string | null) {
      this.taskCenterExpandedId = id;
      this.saveState();
    },
    setTaskCenterOtherCollapsed(collapsed: boolean) {
      this.taskCenterOtherCollapsed = collapsed;
      this.saveState();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
