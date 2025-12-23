/**
 * 主题常量 - 统一整个应用的主题配置
 * 所有组件应使用这些常量来保持视觉一致性
 */

export const Theme = {
  // 颜色 - 使用 TailwindCSS Tsukuyomi 调色板
  colors: {
    // 主色 - Primary（月白）
    primary: {
      DEFAULT: '#E9EDF5',
      50: '#F7F4EC', // Paper（和纸）
      100: '#F5F1F0',
      200: '#E9EDF5', // Primary（月白）
      300: '#D8DDE8',
      400: '#C7CEDB',
      500: '#B6BECE',
      600: '#9FA8B8',
      700: '#8892A2',
      800: '#717C8C',
      900: '#5A6676',
      950: '#435060',
    },
    // 背景色 - Secondary（影墨）
    night: {
      DEFAULT: '#1C1F26', // Secondary（影墨）
      900: '#1C1F26',
      950: '#0F1114',
    },
    // 文本色 - Paper（和纸）
    moon: {
      DEFAULT: '#F7F4EC', // Paper（和纸）
      400: '#F0EDE4',
      500: '#F7F4EC',
    },
    // 警告色
    warning: {
      DEFAULT: '#f2c037',
      opacity30: 'rgba(242, 192, 55, 0.3)',
    },
  },

  // 背景透明度级别
  bgOpacity: {
    subtle: 'rgba(255, 255, 255, 0.03)',
    light: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.08)',
    strong: 'rgba(255, 255, 255, 0.1)',
    primary: 'rgba(233, 237, 245, 0.1)', // Primary（月白）
    primaryLight: 'rgba(233, 237, 245, 0.2)',
    primaryMedium: 'rgba(233, 237, 245, 0.3)',
  },

  // 边框透明度级别
  borderOpacity: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.15)',
    strong: 'rgba(255, 255, 255, 0.2)',
    primary: 'rgba(233, 237, 245, 0.2)', // Primary（月白）
    primaryMedium: 'rgba(233, 237, 245, 0.5)',
    primaryStrong: 'rgba(233, 237, 245, 0.8)',
  },

  // 文本透明度级别
  textOpacity: {
    disabled: 'rgba(247, 244, 236, 0.4)', // Paper（和纸）
    muted: 'rgba(247, 244, 236, 0.6)',
    medium: 'rgba(247, 244, 236, 0.7)',
    normal: 'rgba(247, 244, 236, 0.8)',
    strong: 'rgba(247, 244, 236, 0.9)',
    full: 'rgba(247, 244, 236, 1)',
  },

  // 翻译文本颜色（Highlight（薄藍））
  translationText: {
    DEFAULT: 'rgba(109, 136, 168, 0.9)', // Highlight（薄藍）with high opacity
    light: 'rgba(109, 136, 168, 0.8)',
    medium: 'rgba(109, 136, 168, 0.7)',
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
    primary: '0 2px 8px rgba(109, 136, 168, 0.3)', // Highlight（薄藍）
    primaryHover: '0 4px 12px rgba(109, 136, 168, 0.4)',
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
  textTranslation: 'text-translation', // 翻译文本颜色（区别于原文，使用 Highlight（薄藍））

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
