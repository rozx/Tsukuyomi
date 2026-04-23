// Tsukuyomi 主题的原始色值 token。
// 有意保持不依赖 PrimeVue（`@primevue/themes`、`definePreset` 等），以便
// 非 UI 的服务（如 CoverService）可以复用色值而无需把整个主题预设拉进 bundle。
// `tsukuyomi-preset.ts` 会从本文件导入并交给 definePreset 构造完整主题。

export type ColorScale = Record<number, string>;

// Primary（月白）: #E9EDF5
export const PRIMARY: ColorScale = {
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
};

// Secondary（影墨）: #1C1F26
export const SURFACE_DARK: ColorScale = {
  0: '#0F1114',
  50: '#14161A',
  100: '#1C1F26', // Secondary（影墨）
  200: '#242730',
  300: '#2C2F3A',
  400: '#343744',
  500: '#3C3F4E',
  600: '#444758',
  700: '#4C4F62',
  800: '#54576C',
  900: '#5C5F76',
};

// 翻译文本颜色（tsukuyomi-200 提亮版）
// 在极暗底上保持约 10:1 对比度，同时保留冷月蓝身份色
export const TRANSLATION_TEXT_COLOR = 'rgba(186, 201, 219, 0.95)';
