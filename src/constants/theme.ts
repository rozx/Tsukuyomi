/**
 * 主题常量 - 统一整个应用的主题配置
 * 所有组件应使用这些常量来保持视觉一致性
 */

export const Theme = {
  // 颜色 - 使用 TailwindCSS Luna 调色板
  colors: {
    // 主色 - Luna 粉
    primary: {
      DEFAULT: '#f0458b',
      50: '#fef2f7',
      100: '#fce7f0',
      200: '#f9cfe1',
      300: '#f4a7c8',
      400: '#ed6ba8',
      500: '#f0458b',
      600: '#d91d7a',
      700: '#b81666',
      800: '#961455',
      900: '#7a1145',
      950: '#4d0a2b',
    },
    // 背景色 - Night 深色
    night: {
      DEFAULT: '#0b1026',
      900: '#0b1026',
      950: '#070a1a',
    },
    // 文本色 - Moon 浅色
    moon: {
      DEFAULT: '#f6f3d1',
      400: '#f1e3a8',
      500: '#f6f3d1',
    },
  },

  // 背景透明度级别
  bgOpacity: {
    subtle: 'rgba(255, 255, 255, 0.03)',
    light: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.08)',
    strong: 'rgba(255, 255, 255, 0.1)',
    primary: 'rgba(240, 69, 139, 0.1)',
    primaryLight: 'rgba(240, 69, 139, 0.2)',
    primaryMedium: 'rgba(240, 69, 139, 0.3)',
  },

  // 边框透明度级别
  borderOpacity: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.15)',
    strong: 'rgba(255, 255, 255, 0.2)',
    primary: 'rgba(240, 69, 139, 0.2)',
    primaryMedium: 'rgba(240, 69, 139, 0.5)',
    primaryStrong: 'rgba(240, 69, 139, 0.8)',
  },

  // 文本透明度级别
  textOpacity: {
    disabled: 'rgba(246, 243, 209, 0.4)',
    muted: 'rgba(246, 243, 209, 0.6)',
    medium: 'rgba(246, 243, 209, 0.7)',
    normal: 'rgba(246, 243, 209, 0.8)',
    strong: 'rgba(246, 243, 209, 0.9)',
    full: 'rgba(246, 243, 209, 1)',
  },

  // 翻译文本颜色（带主色色调的文本色）
  translationText: {
    DEFAULT: 'rgba(240, 69, 139, 0.9)', // primary with high opacity
    light: 'rgba(240, 69, 139, 0.8)',
    medium: 'rgba(240, 69, 139, 0.7)',
  },

  // 圆角
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '10px',
    xl: '12px',
  },

  // 阴影
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
    md: '0 2px 4px rgba(0, 0, 0, 0.15)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.15)',
    xl: '0 20px 60px rgba(0, 0, 0, 0.5)',
    primary: '0 2px 8px rgba(240, 69, 139, 0.3)',
    primaryHover: '0 4px 12px rgba(240, 69, 139, 0.4)',
  },

  // 过渡动画
  transitions: {
    fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

/**
 * Tailwind CSS 工具类映射
 * 这些类名可以在组件中直接使用
 */
export const ThemeClasses = {
  // 背景
  bgCard: 'bg-night-900/50',
  bgCardLight: 'bg-white/5',
  bgCardMedium: 'bg-white/8',
  bgPrimary: 'bg-primary/10',
  bgPrimaryLight: 'bg-primary/20',
  bgPrimaryMedium: 'bg-primary/30',

  // 边框
  borderCard: 'border border-white/10',
  borderCardLight: 'border border-white/15',
  borderPrimary: 'border border-primary/20',
  borderPrimaryMedium: 'border border-primary/50',

  // 文本
  textPrimary: 'text-moon/90',
  textSecondary: 'text-moon/70',
  textMuted: 'text-moon/60',
  textDisabled: 'text-moon/40',
  textPrimaryColor: 'text-primary',
  textTranslation: 'text-translation', // 翻译文本颜色（区别于原文，使用 Luna 粉色调）

  // 圆角
  roundedCard: 'rounded-lg',
  roundedCardLarge: 'rounded-xl',

  // 阴影
  shadowCard: 'shadow-lg',
  shadowPrimary: 'shadow-lg shadow-primary/20',

  // 悬停效果
  hoverCard: 'hover:bg-white/10 hover:border-white/20',
  hoverPrimary: 'hover:bg-primary/20 hover:border-primary/50',

  // 搜索输入组
  searchInputGroup: 'search-input-group',
  searchInput: 'search-input',
  inputActionAddon: 'input-action-addon',
  inputActionButton: 'input-action-button',
} as const;
