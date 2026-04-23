import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import { PRIMARY, SURFACE_DARK, TRANSLATION_TEXT_COLOR, type ColorScale } from './color-tokens';

// 原始色值放在 `./color-tokens`（不依赖 PrimeVue），这里直接 re-export 保持既有消费者不变
export { PRIMARY, SURFACE_DARK, TRANSLATION_TEXT_COLOR };

// Accent（銀月）: #AEB7C6
const ACCENT: ColorScale = {
  50: '#F0F2F5',
  100: '#E4E7EC',
  200: '#D8DCE3',
  300: '#CCD1DA',
  400: '#C0C6D1',
  500: '#AEB7C6', // Accent（銀月）
  600: '#9CA5B3',
  700: '#8A93A0',
  800: '#78818D',
  900: '#666F7A',
};

// Highlight（薄藍）: #6D88A8
const ACCENT_TEAL: ColorScale = {
  50: '#E8EDF3',
  100: '#D1DBE7',
  200: '#BAC9DB',
  300: '#A3B7CF',
  400: '#8CA5C3',
  500: '#6D88A8', // Highlight（薄藍）
  600: '#5D7898',
  700: '#4D6888',
  800: '#3D5878',
  900: '#2D4868',
};

// Text colors: charcoal or deep navy for contrast
const TEXT_CHARCOAL = '#36454f'; // Charcoal
const TEXT_DEEP_NAVY = '#1a237e'; // Deep navy
const TEXT_DARK = '#212121'; // Dark for light backgrounds

// 状态色 —— 与 tailwind.config.cjs 的 success / danger / warning 调色板保持一致
const SUCCESS = {
  DEFAULT: '#7fb389',
  200: '#b9d9c1',
  300: '#a7d1b0',
  500: '#7fb389',
} as const;

const DANGER = {
  DEFAULT: '#ef5f5f',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef5f5f',
} as const;

const WARNING = {
  DEFAULT: '#f2c037',
  200: '#e8c78a',
} as const;

// Paper（和纸）: #F7F4EC
const SURFACE_LIGHT: ColorScale = {
  0: '#FDFCF9',
  50: '#F7F4EC', // Paper（和纸）
  100: '#F0EDE4',
  200: '#E9E6DC',
  300: '#E2DFD4',
  400: '#DBD8CC',
  500: '#D4D1C4',
  600: '#CDCAAC',
  700: '#C6C394',
  800: '#BFBC7C',
  900: '#B8B564',
};

const FORM_FIELD_DARK = {
  background: 'rgba(255, 255, 255, 0.04)',
  disabledBackground: 'rgba(255, 255, 255, 0.02)',
  filledBackground: 'rgba(233, 237, 245, 0.08)', /* Primary（月白）*/
  filledHoverBackground: 'rgba(233, 237, 245, 0.12)',
  filledFocusBackground: 'rgba(233, 237, 245, 0.16)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  hoverBorderColor: 'rgba(255, 255, 255, 0.2)',
  focusBorderColor: 'rgba(174, 183, 198, 0.6)', /* Accent（銀月）*/
  invalidBorderColor: '#ff8fa3',
  color: '#f8f7ff',
  disabledColor: 'rgba(248, 247, 255, 0.4)',
  placeholderColor: 'rgba(248, 247, 255, 0.5)',
  invalidPlaceholderColor: '#ffb3c2',
  floatLabelColor: 'rgba(248, 247, 255, 0.45)',
  floatLabelFocusColor: ACCENT[400],
  floatLabelActiveColor: ACCENT[500],
  floatLabelInvalidColor: '#ff9db8',
  iconColor: 'rgba(248, 247, 255, 0.65)',
      shadow: '0 0 0 1px rgba(109, 136, 168, 0.2)', /* Highlight（薄藍）glow*/
};

const FORM_FIELD_LIGHT = {
  background: 'rgba(233, 237, 245, 0.5)', /* Primary（月白）*/
  disabledBackground: 'rgba(233, 237, 245, 0.25)',
  filledBackground: 'rgba(233, 237, 245, 0.7)',
  filledHoverBackground: 'rgba(233, 237, 245, 0.85)',
  filledFocusBackground: 'rgba(233, 237, 245, 0.95)',
  borderColor: 'rgba(233, 237, 245, 0.5)',
  hoverBorderColor: 'rgba(233, 237, 245, 0.7)',
      focusBorderColor: ACCENT[500], /* Accent（銀月）*/
  invalidBorderColor: '#d94d64',
  color: TEXT_CHARCOAL,
  disabledColor: 'rgba(54, 69, 79, 0.45)',
  placeholderColor: 'rgba(54, 69, 79, 0.6)',
  invalidPlaceholderColor: '#d94d64',
  floatLabelColor: 'rgba(54, 69, 79, 0.5)',
      floatLabelFocusColor: ACCENT[500], /* Accent（銀月）*/
  floatLabelActiveColor: TEXT_DEEP_NAVY,
  floatLabelInvalidColor: '#d94d64',
  iconColor: 'rgba(54, 69, 79, 0.55)',
      shadow: '0 0 0 1px rgba(174, 183, 198, 0.15)', /* Accent（銀月）glow*/
};

const CUSTOM_CSS = `
:root {
  --primary-color: ${PRIMARY[500]};
  --primary-color-text: ${TEXT_CHARCOAL};
  
  --text-charcoal: ${TEXT_CHARCOAL};
  --text-deep-navy: ${TEXT_DEEP_NAVY};
  --text-dark: ${TEXT_DARK};
  --primary-50: ${PRIMARY[50]};
  --primary-100: ${PRIMARY[100]};
  --primary-200: ${PRIMARY[200]};
  --primary-300: ${PRIMARY[300]};
  --primary-400: ${PRIMARY[400]};
  --primary-500: ${PRIMARY[500]};
  --primary-600: ${PRIMARY[600]};
  --primary-700: ${PRIMARY[700]};
  --primary-800: ${PRIMARY[800]};
  --primary-900: ${PRIMARY[900]};
  --primary-950: ${PRIMARY[950]};
  --primary-opacity-10: rgba(233, 237, 245, 0.1);
  --primary-opacity-15: rgba(233, 237, 245, 0.15);
  --primary-opacity-20: rgba(233, 237, 245, 0.2);
  --primary-opacity-25: rgba(233, 237, 245, 0.25);
  --primary-opacity-30: rgba(233, 237, 245, 0.3);
  --primary-opacity-40: rgba(233, 237, 245, 0.4);
  --primary-opacity-50: rgba(233, 237, 245, 0.5);
  --primary-opacity-60: rgba(233, 237, 245, 0.6);
  --primary-opacity-70: rgba(233, 237, 245, 0.7);
  --primary-opacity-80: rgba(233, 237, 245, 0.8);
  --primary-opacity-85: rgba(233, 237, 245, 0.85);
  --primary-opacity-90: rgba(233, 237, 245, 0.9);
  --primary-opacity-95: rgba(233, 237, 245, 0.95);
  --primary-opacity-100: rgba(233, 237, 245, 1);
  
  /* Primary（月白）and Paper（和纸）*/
  --moon-white: ${PRIMARY[200]};
  --paper: ${PRIMARY[50]};

  --moon-opacity-30: rgba(253, 253, 255, 0.3);
  --moon-opacity-40: rgba(253, 253, 255, 0.4);
  --moon-opacity-50: rgba(253, 253, 255, 0.5);
  --moon-opacity-60: rgba(253, 253, 255, 0.6);
  --moon-opacity-70: rgba(253, 253, 255, 0.7);
  --moon-opacity-80: rgba(253, 253, 255, 0.8);
  --moon-opacity-85: rgba(253, 253, 255, 0.85);
  --moon-opacity-90: rgba(253, 253, 255, 0.9);
  --moon-opacity-95: rgba(253, 253, 255, 0.95);
  --moon-opacity-100: #fdfdff;
  
  /* Accent（銀月）and Highlight（薄藍）*/
  --accent-silver: ${ACCENT[500]};
  --accent-blue: ${ACCENT_TEAL[500]};

  --white-opacity-3: rgba(255, 255, 255, 0.03);
  --white-opacity-4: rgba(255, 255, 255, 0.04);
  --white-opacity-5: rgba(255, 255, 255, 0.05);
  --white-opacity-6: rgba(255, 255, 255, 0.06);
  --white-opacity-8: rgba(255, 255, 255, 0.08);
  --white-opacity-10: rgba(255, 255, 255, 0.1);
  --white-opacity-12: rgba(255, 255, 255, 0.12);
  --white-opacity-15: rgba(255, 255, 255, 0.15);
  --white-opacity-18: rgba(255, 255, 255, 0.18);
  --white-opacity-20: rgba(255, 255, 255, 0.2);
  --white-opacity-25: rgba(255, 255, 255, 0.25);
  --white-opacity-30: rgba(255, 255, 255, 0.3);
  --white-opacity-2: rgba(255, 255, 255, 0.02);
  --white-opacity-2-5: rgba(255, 255, 255, 0.025);
  --white-opacity-14: rgba(255, 255, 255, 0.14);
  --white-opacity-80: rgba(255, 255, 255, 0.8);
  --white-opacity-90: rgba(255, 255, 255, 0.9);

  /* Secondary（影墨）*/
  --black-opacity-10: rgba(28, 31, 38, 0.1);
  --black-opacity-15: rgba(28, 31, 38, 0.15);
  --black-opacity-20: rgba(28, 31, 38, 0.2);
  --black-opacity-30: rgba(28, 31, 38, 0.3);
  --black-opacity-50: rgba(28, 31, 38, 0.5);
  --black-opacity-80: rgba(28, 31, 38, 0.8);

  /* Accent（銀月）and Highlight（薄藍）*/
  --accent-color: ${ACCENT[500]};
  --accent-blue-color: ${ACCENT_TEAL[500]};
  --danger-color: #ff8fa3;
  --warning-color: #ffd27b;
  
  /* Translation text color - 提亮 tsukuyomi-200（#BAC9DB）以保障长段阅读可读性 */
  --translation-text-color: rgba(186, 201, 219, 0.95);

  /* 状态色 —— 与 tailwind.config.cjs 的 success / danger / warning 调色板保持一致 */
  --color-success: ${SUCCESS.DEFAULT};
  --color-success-200: ${SUCCESS[200]};
  --color-success-300: ${SUCCESS[300]};
  --color-success-500: ${SUCCESS[500]};
  --color-danger: ${DANGER.DEFAULT};
  --color-danger-200: ${DANGER[200]};
  --color-danger-300: ${DANGER[300]};
  --color-danger-400: ${DANGER[400]};
  --color-danger-500: ${DANGER[500]};
  --color-warning: ${WARNING.DEFAULT};
  --color-warning-200: ${WARNING[200]};

  /* Tsukuyomi（薄藍 / Highlight）完整 scale —— 与 Tailwind tsukuyomi-* palette 一一对应 */
  --tsukuyomi-50: ${ACCENT_TEAL[50]};
  --tsukuyomi-100: ${ACCENT_TEAL[100]};
  --tsukuyomi-200: ${ACCENT_TEAL[200]};
  --tsukuyomi-300: ${ACCENT_TEAL[300]};
  --tsukuyomi-400: ${ACCENT_TEAL[400]};
  --tsukuyomi-500: ${ACCENT_TEAL[500]};
  --tsukuyomi-600: ${ACCENT_TEAL[600]};
  --tsukuyomi-700: ${ACCENT_TEAL[700]};
  --tsukuyomi-800: ${ACCENT_TEAL[800]};
  --tsukuyomi-900: ${ACCENT_TEAL[900]};

  /* Accent（銀月 #AEB7C6）完整 scale —— 与 Tailwind accent-* 对应 */
  --accent-50: ${ACCENT[50]};
  --accent-100: ${ACCENT[100]};
  --accent-200: ${ACCENT[200]};
  --accent-300: ${ACCENT[300]};
  --accent-400: ${ACCENT[400]};
  --accent-500: ${ACCENT[500]};
  --accent-600: ${ACCENT[600]};
  --accent-700: ${ACCENT[700]};
  --accent-800: ${ACCENT[800]};
  --accent-900: ${ACCENT[900]};
  --accent-opacity-15: rgba(174, 183, 198, 0.15);
  --accent-opacity-20: rgba(174, 183, 198, 0.2);
  --accent-opacity-28: rgba(174, 183, 198, 0.28);
  --accent-opacity-38: rgba(174, 183, 198, 0.38);
  --accent-opacity-30: rgba(174, 183, 198, 0.3);
  --accent-opacity-42: rgba(174, 183, 198, 0.42);
  --accent-opacity-45: rgba(174, 183, 198, 0.45);
  --accent-opacity-50: rgba(174, 183, 198, 0.5);
  --accent-opacity-55: rgba(174, 183, 198, 0.55);
  --accent-opacity-70: rgba(174, 183, 198, 0.7);
  --accent-opacity-75: rgba(174, 183, 198, 0.75);
  --accent-opacity-85: rgba(174, 183, 198, 0.85);

  /* Night（影墨）scale —— 与 Tailwind night-* palette 对应 */
  --night-50: #2C2F3A;
  --night-100: #242730;
  --night-200: #1C1F26;
  --night-300: #14161A;
  --night-400: #0F1114;
  --night-500: #0A0C0F;
  --night-600: #050608;
  --night-700: #030405;
  --night-800: #020303;
  --night-900: #010202;
  --night-950: #000101;
  --night-500-opacity-55: rgba(10, 12, 15, 0.55);
  --night-500-opacity-72: rgba(10, 12, 15, 0.72);

  /* Moon（Paper 系列）solid —— 与 Tailwind moon-* palette 对应 */
  --moon-50: #F7F4EC;
  --moon-100: #F0EDE4;
  --moon-200: #E9EDF5;

  /* tsukuyomi-500（薄藍 #6D88A8）完整透明度序列（2..95%）*/
  --tsukuyomi-opacity-2: rgba(109, 136, 168, 0.02);
  --tsukuyomi-opacity-3: rgba(109, 136, 168, 0.03);
  --tsukuyomi-opacity-4: rgba(109, 136, 168, 0.04);
  --tsukuyomi-opacity-6: rgba(109, 136, 168, 0.06);
  --tsukuyomi-opacity-8: rgba(109, 136, 168, 0.08);
  --tsukuyomi-opacity-10: rgba(109, 136, 168, 0.1);
  --tsukuyomi-opacity-12: rgba(109, 136, 168, 0.12);
  --tsukuyomi-opacity-14: rgba(109, 136, 168, 0.14);
  --tsukuyomi-opacity-15: rgba(109, 136, 168, 0.15);
  --tsukuyomi-opacity-18: rgba(109, 136, 168, 0.18);
  --tsukuyomi-opacity-20: rgba(109, 136, 168, 0.2);
  --tsukuyomi-opacity-22: rgba(109, 136, 168, 0.22);
  --tsukuyomi-opacity-24: rgba(109, 136, 168, 0.24);
  --tsukuyomi-opacity-25: rgba(109, 136, 168, 0.25);
  --tsukuyomi-opacity-28: rgba(109, 136, 168, 0.28);
  --tsukuyomi-opacity-30: rgba(109, 136, 168, 0.3);
  --tsukuyomi-opacity-32: rgba(109, 136, 168, 0.32);
  --tsukuyomi-opacity-35: rgba(109, 136, 168, 0.35);
  --tsukuyomi-opacity-40: rgba(109, 136, 168, 0.4);
  --tsukuyomi-opacity-38: rgba(109, 136, 168, 0.38);
  --tsukuyomi-opacity-45: rgba(109, 136, 168, 0.45);
  --tsukuyomi-opacity-50: rgba(109, 136, 168, 0.5);
  --tsukuyomi-opacity-85: rgba(109, 136, 168, 0.85);
  --tsukuyomi-opacity-90: rgba(109, 136, 168, 0.9);
  --tsukuyomi-opacity-95: rgba(109, 136, 168, 0.95);

  /* tsukuyomi-300（#A3B7CF）透明度序列 */
  --tsukuyomi-300-opacity-20: rgba(163, 183, 207, 0.2);
  --tsukuyomi-300-opacity-22: rgba(163, 183, 207, 0.22);
  --tsukuyomi-300-opacity-32: rgba(163, 183, 207, 0.32);
  --tsukuyomi-300-opacity-40: rgba(163, 183, 207, 0.4);
  --tsukuyomi-300-opacity-50: rgba(163, 183, 207, 0.5);
  --tsukuyomi-300-opacity-55: rgba(163, 183, 207, 0.55);
  --tsukuyomi-300-opacity-70: rgba(163, 183, 207, 0.7);
  --tsukuyomi-300-opacity-75: rgba(163, 183, 207, 0.75);
  --tsukuyomi-300-opacity-85: rgba(163, 183, 207, 0.85);
  --tsukuyomi-300-opacity-90: rgba(163, 183, 207, 0.9);

  /* tsukuyomi-200（#BAC9DB）透明度序列 */
  --tsukuyomi-200-opacity-5: rgba(186, 201, 219, 0.05);
  --tsukuyomi-200-opacity-6: rgba(186, 201, 219, 0.06);
  --tsukuyomi-200-opacity-8: rgba(186, 201, 219, 0.08);
  --tsukuyomi-200-opacity-20: rgba(186, 201, 219, 0.2);
  --tsukuyomi-200-opacity-22: rgba(186, 201, 219, 0.22);
  --tsukuyomi-200-opacity-28: rgba(186, 201, 219, 0.28);
  --tsukuyomi-200-opacity-30: rgba(186, 201, 219, 0.3);
  --tsukuyomi-200-opacity-75: rgba(186, 201, 219, 0.75);
  --tsukuyomi-200-opacity-82: rgba(186, 201, 219, 0.82);
  --tsukuyomi-200-opacity-85: rgba(186, 201, 219, 0.85);

  /* moon-50（Paper 和纸 #F7F4EC）完整透明度序列 —— 5% 步长 + 高频边缘值 */
  --moon-50-opacity-20: rgba(247, 244, 236, 0.2);
  --moon-50-opacity-25: rgba(247, 244, 236, 0.25);
  --moon-50-opacity-30: rgba(247, 244, 236, 0.3);
  --moon-50-opacity-35: rgba(247, 244, 236, 0.35);
  --moon-50-opacity-45: rgba(247, 244, 236, 0.45);
  --moon-50-opacity-48: rgba(247, 244, 236, 0.48);
  --moon-50-opacity-50: rgba(247, 244, 236, 0.5);
  --moon-50-opacity-52: rgba(247, 244, 236, 0.52);
  --moon-50-opacity-55: rgba(247, 244, 236, 0.55);
  --moon-50-opacity-56: rgba(247, 244, 236, 0.56);
  --moon-50-opacity-58: rgba(247, 244, 236, 0.58);
  --moon-50-opacity-60: rgba(247, 244, 236, 0.6);
  --moon-50-opacity-62: rgba(247, 244, 236, 0.62);
  --moon-50-opacity-65: rgba(247, 244, 236, 0.65);
  --moon-50-opacity-68: rgba(247, 244, 236, 0.68);
  --moon-50-opacity-70: rgba(247, 244, 236, 0.7);
  --moon-50-opacity-72: rgba(247, 244, 236, 0.72);
  --moon-50-opacity-75: rgba(247, 244, 236, 0.75);
  --moon-50-opacity-78: rgba(247, 244, 236, 0.78);
  --moon-50-opacity-80: rgba(247, 244, 236, 0.8);
  --moon-50-opacity-82: rgba(247, 244, 236, 0.82);
  --moon-50-opacity-85: rgba(247, 244, 236, 0.85);
  --moon-50-opacity-88: rgba(247, 244, 236, 0.88);
  --moon-50-opacity-90: rgba(247, 244, 236, 0.9);
  --moon-50-opacity-92: rgba(247, 244, 236, 0.92);
  --moon-50-opacity-95: rgba(247, 244, 236, 0.95);
  --moon-50-opacity-96: rgba(247, 244, 236, 0.96);
  --moon-50-opacity-100: rgba(247, 244, 236, 1);

  /* night-300（#14161A）透明度 */
  --night-300-opacity-72: rgba(20, 22, 26, 0.72);
  --night-300-opacity-96: rgba(20, 22, 26, 0.96);

  /* 近 night-500（#080A0D / #0E1014）的深色壳透明度 */
  --shell-opacity-45: rgba(10, 12, 15, 0.45);
  --shell-opacity-50: rgba(8, 10, 13, 0.5);
  --shell-opacity-55: rgba(10, 14, 26, 0.55);
  --shell-opacity-60: rgba(5, 7, 10, 0.6);
  --shell-opacity-72: rgba(8, 10, 13, 0.72);
  --shell-opacity-82: rgba(10, 14, 20, 0.82);
  --shell-opacity-96: rgba(14, 16, 20, 0.96);

  /* danger / red 透明度（与 --color-danger 系列对应）*/
  --color-danger-opacity-8: rgba(239, 95, 95, 0.08);
  --color-danger-opacity-15: rgba(239, 95, 95, 0.15);
  --color-danger-opacity-30: rgba(239, 95, 95, 0.3);
  --color-danger-opacity-40: rgba(239, 95, 95, 0.4);
  --color-danger-400-opacity-15: rgba(248, 113, 113, 0.15);
  --color-danger-400-opacity-30: rgba(248, 113, 113, 0.3);
  --red-500-opacity-8: rgba(239, 68, 68, 0.08);
  --red-500-opacity-18: rgba(239, 68, 68, 0.18);
  --red-500-opacity-28: rgba(239, 68, 68, 0.28);
  --red-500-opacity-30: rgba(239, 68, 68, 0.3);

  /* success / green 透明度 */
  --color-success-opacity-10: rgba(127, 179, 137, 0.1);
  --color-success-opacity-12: rgba(127, 179, 137, 0.12);
  --color-success-opacity-28: rgba(127, 179, 137, 0.28);
  --color-success-opacity-30: rgba(127, 179, 137, 0.3);
  --color-success-300-opacity-10: rgba(167, 209, 176, 0.1);
  --color-success-300-opacity-28: rgba(167, 209, 176, 0.28);

  /* warning / amber 透明度 */
  --color-warning-opacity-12: rgba(242, 192, 55, 0.12);
  --color-warning-opacity-30: rgba(242, 192, 55, 0.3);

  /* primary（月白 #E9EDF5）额外透明度 */
  --primary-opacity-35: rgba(233, 237, 245, 0.35);

  /* tsukuyomi-200（#BAC9DB）额外透明度 */
  --tsukuyomi-200-opacity-24: rgba(186, 201, 219, 0.24);
}

/* Badge 样式优化 - Moonlight Glow 主题 */
.p-badge {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  font-size: 10px !important;
  line-height: 1 !important;
  padding: 0 4px !important;
  min-width: 1rem !important;
  height: 1rem !important;
  border-radius: 9999px !important;
  font-weight: 600 !important;
}

/* 确保 Badge 在按钮中不被裁剪 */
/* Badge 相对于相对定位的容器（如按钮或按钮容器）定位 */
.relative .p-badge {
  position: absolute !important;
  top: 0.25rem !important;
  right: 0.25rem !important;
  transform: translate(25%, -25%) !important;
  z-index: 20 !important;
  pointer-events: none !important;
}

.p-button .p-badge,
.p-button-label .p-badge {
  position: absolute !important;
  top: 0.25rem !important;
  right: 0.25rem !important;
  transform: translate(25%, -25%) !important;
  z-index: 20 !important;
  pointer-events: none !important;
}

.p-button {
  overflow: visible !important;
  position: relative !important;
}

.p-button-label {
  overflow: visible !important;
  position: relative !important;
}

/*
 * PrimeVue ships .p-button-icon-only::after with a hidden nbsp (content U+00A0)
 * to reserve a line-box so icon-only buttons match the height of labeled buttons.
 * That hack relies on .p-button clipping via overflow:hidden. Since this theme
 * forces overflow:visible !important above (for badges / tooltips / focus rings
 * that should spill outside the button), the pseudo-element is no longer clipped
 * and inflates icon-only buttons vertically (~72-90px tall). Neutralize it — we
 * rely on natural padding + icon size, which is already consistent across buttons.
 */
.p-button-icon-only::after {
  content: none !important;
}

/* Toast severity styling for Moonlight Glow theme - Enhanced Design */
/* Base Toast container styling */
.p-toast {
  z-index: 9999;
  padding: 0;
  gap: 0.75rem;
}

.p-toast .p-toast-message {
  margin: 0;
  padding: 1rem 1.25rem;
  border-radius: 16px;
  border-width: 1px;
  border-style: solid;
  box-shadow: 0 8px 32px rgba(5, 8, 24, 0.5), 0 4px 16px rgba(5, 8, 24, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  min-width: 380px;
  max-width: 480px;
  /* 移除 transition，让 PrimeVue 的过渡系统处理动画 */
}

.p-toast .p-toast-message-content {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0;
}

.p-toast .p-toast-message-icon {
  font-size: 1.5rem;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.p-toast .p-toast-message-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.p-toast .p-toast-summary {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.4;
  margin: 0;
}

.p-toast .p-toast-detail {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
  margin: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.p-toast .p-toast-icon-close {
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.875rem;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.p-toast .p-toast-icon-close:hover {
  opacity: 1;
  transform: scale(1.1);
}

/* Success Toast - Highlight（薄藍） */
.p-toast .p-toast-message[data-p-severity="success"],
.p-toast .p-toast-message.p-severity-success,
.p-toast-message-success {
  background: linear-gradient(135deg, rgba(109, 136, 168, 0.25) 0%, rgba(109, 136, 168, 0.15) 100%) !important;
  background-color: rgba(28, 31, 38, 0.92) !important;
  border-color: ${ACCENT_TEAL[400]} !important;
  border-left-width: 4px !important;
}

.p-toast .p-toast-message[data-p-severity="success"] .p-toast-message-icon,
.p-toast .p-toast-message.p-severity-success .p-toast-message-icon,
.p-toast-message-success .p-toast-message-icon,
.p-toast-message-success [class*="icon"]:not(.p-toast-icon-close) {
  color: ${ACCENT_TEAL[300]} !important;
}

.p-toast .p-toast-message[data-p-severity="success"] .p-toast-summary,
.p-toast .p-toast-message.p-severity-success .p-toast-summary,
.p-toast-message-success .p-toast-summary {
  color: #f8f7ff !important;
}

.p-toast .p-toast-message[data-p-severity="success"] .p-toast-detail,
.p-toast .p-toast-message.p-severity-success .p-toast-detail,
.p-toast-message-success .p-toast-detail {
  color: rgba(248, 247, 255, 0.75) !important;
}

.p-toast .p-toast-message[data-p-severity="success"] .p-toast-icon-close,
.p-toast .p-toast-message.p-severity-success .p-toast-icon-close,
.p-toast-message-success .p-toast-icon-close {
  color: rgba(248, 247, 255, 0.6) !important;
}

/* Info Toast - Accent（銀月） */
.p-toast .p-toast-message[data-p-severity="info"],
.p-toast .p-toast-message.p-severity-info,
.p-toast-message-info {
  background: linear-gradient(135deg, rgba(174, 183, 198, 0.25) 0%, rgba(174, 183, 198, 0.15) 100%) !important;
  background-color: rgba(28, 31, 38, 0.92) !important;
  border-color: ${ACCENT[500]} !important;
  border-left-width: 4px !important;
}

.p-toast .p-toast-message[data-p-severity="info"] .p-toast-message-icon,
.p-toast .p-toast-message.p-severity-info .p-toast-message-icon,
.p-toast-message-info .p-toast-message-icon,
.p-toast-message-info [class*="icon"]:not(.p-toast-icon-close) {
  color: ${ACCENT[500]} !important;
}

.p-toast .p-toast-message[data-p-severity="info"] .p-toast-summary,
.p-toast .p-toast-message.p-severity-info .p-toast-summary,
.p-toast-message-info .p-toast-summary {
  color: #f8f7ff !important;
}

.p-toast .p-toast-message[data-p-severity="info"] .p-toast-detail,
.p-toast .p-toast-message.p-severity-info .p-toast-detail,
.p-toast-message-info .p-toast-detail {
  color: rgba(248, 247, 255, 0.75) !important;
}

.p-toast .p-toast-message[data-p-severity="info"] .p-toast-icon-close,
.p-toast .p-toast-message.p-severity-info .p-toast-icon-close,
.p-toast-message-info .p-toast-icon-close {
  color: rgba(248, 247, 255, 0.6) !important;
}

/* Warn Toast - Warning */
.p-toast .p-toast-message[data-p-severity="warn"],
.p-toast .p-toast-message.p-severity-warn,
.p-toast-message-warn {
  background: linear-gradient(135deg, rgba(255, 210, 123, 0.25) 0%, rgba(255, 210, 123, 0.15) 100%) !important;
  background-color: rgba(28, 31, 38, 0.92) !important;
  border-color: #ffd27b !important;
  border-left-width: 4px !important;
}

.p-toast .p-toast-message[data-p-severity="warn"] .p-toast-message-icon,
.p-toast .p-toast-message.p-severity-warn .p-toast-message-icon,
.p-toast-message-warn .p-toast-message-icon,
.p-toast-message-warn [class*="icon"]:not(.p-toast-icon-close) {
  color: #ffd27b !important;
}

.p-toast .p-toast-message[data-p-severity="warn"] .p-toast-summary,
.p-toast .p-toast-message.p-severity-warn .p-toast-summary,
.p-toast-message-warn .p-toast-summary {
  color: #f8f7ff !important;
}

.p-toast .p-toast-message[data-p-severity="warn"] .p-toast-detail,
.p-toast .p-toast-message.p-severity-warn .p-toast-detail,
.p-toast-message-warn .p-toast-detail {
  color: rgba(248, 247, 255, 0.75) !important;
}

.p-toast .p-toast-message[data-p-severity="warn"] .p-toast-icon-close,
.p-toast .p-toast-message.p-severity-warn .p-toast-icon-close,
.p-toast-message-warn .p-toast-icon-close {
  color: rgba(248, 247, 255, 0.6) !important;
}

/* Error Toast - Danger */
.p-toast .p-toast-message[data-p-severity="error"],
.p-toast .p-toast-message.p-severity-error,
.p-toast-message-error {
  background: linear-gradient(135deg, rgba(255, 143, 163, 0.25) 0%, rgba(255, 143, 163, 0.15) 100%) !important;
  background-color: rgba(28, 31, 38, 0.92) !important;
  border-color: #ff8fa3 !important;
  border-left-width: 4px !important;
}

.p-toast .p-toast-message[data-p-severity="error"] .p-toast-message-icon,
.p-toast .p-toast-message.p-severity-error .p-toast-message-icon,
.p-toast-message-error .p-toast-message-icon,
.p-toast-message-error [class*="icon"]:not(.p-toast-icon-close) {
  color: #ff8fa3 !important;
}

.p-toast .p-toast-message[data-p-severity="error"] .p-toast-summary,
.p-toast .p-toast-message.p-severity-error .p-toast-summary,
.p-toast-message-error .p-toast-summary {
  color: #f8f7ff !important;
}

.p-toast .p-toast-message[data-p-severity="error"] .p-toast-detail,
.p-toast .p-toast-message.p-severity-error .p-toast-detail,
.p-toast-message-error .p-toast-detail {
  color: rgba(248, 247, 255, 0.75) !important;
}

.p-toast .p-toast-message[data-p-severity="error"] .p-toast-icon-close,
.p-toast .p-toast-message.p-severity-error .p-toast-icon-close,
.p-toast-message-error .p-toast-icon-close {
  color: rgba(248, 247, 255, 0.6) !important;
}

/* 移动端：Toast 改为顶部横贯窄条，避开顶部系统栏并防止溢出 */
@media (max-width: 599px) {
  .p-toast {
    top: calc(env(safe-area-inset-top, 0px) + 56px) !important;
    right: 8px !important;
    left: 8px !important;
    width: auto !important;
    max-width: none !important;
    gap: 0.5rem;
  }

  .p-toast .p-toast-message {
    min-width: 0 !important;
    max-width: none !important;
    width: 100%;
    padding: 0.75rem 0.875rem;
    border-radius: 12px;
    box-shadow: 0 6px 20px rgba(5, 8, 24, 0.45), 0 2px 8px rgba(5, 8, 24, 0.25);
  }

  .p-toast .p-toast-message-content {
    gap: 0.75rem;
    align-items: center;
  }

  .p-toast .p-toast-message-icon {
    font-size: 1.125rem;
    width: 1.125rem;
    height: 1.125rem;
    margin-top: 0;
  }

  .p-toast .p-toast-message-text {
    gap: 0.125rem;
  }

  .p-toast .p-toast-summary {
    font-size: 0.875rem;
  }

  .p-toast .p-toast-detail {
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .p-toast .p-toast-icon-close,
  .p-toast .p-toast-close-button {
    width: 1.5rem;
    height: 1.5rem;
    opacity: 0.8;
  }
}
`;

const TsukuyomiPreset = definePreset(Aura, {
  semantic: {
    primary: PRIMARY,
    secondary: ACCENT,
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'rgba(109, 136, 168, 0.6)', /* Highlight（薄藍）*/
      offset: '2px',
      shadow: '0 0 0 4px rgba(174, 183, 198, 0.2)', /* Accent（銀月）*/
    },
    colorScheme: {
      dark: {
        surface: SURFACE_DARK,
        primary: {
          color: PRIMARY[200],
          contrastColor: '#263238',
          hoverColor: PRIMARY[300],
          activeColor: PRIMARY[400],
        },
        highlight: {
          background: 'rgba(109, 136, 168, 0.15)', /* Highlight（薄藍）*/
          focusBackground: 'rgba(174, 183, 198, 0.25)', /* Accent（銀月）*/
          color: '#E8EDF3',
          focusColor: '#ffffff',
        },
        mask: {
          background: 'rgba(28, 31, 38, 0.82)', /* Secondary（影墨）*/
          color: '#0F1114',
        },
        formField: FORM_FIELD_DARK,
        text: {
          color: '#f5f7ff',
          hoverColor: '#ffffff',
          mutedColor: 'rgba(245, 243, 255, 0.7)',
          hoverMutedColor: '#ffffff',
        },
        content: {
          background: 'rgba(28, 31, 38, 0.85)', /* Secondary（影墨）*/
          hoverBackground: 'rgba(28, 31, 38, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          color: '#f8f7ff',
          hoverColor: '#ffffff',
        },
        overlay: {
          select: {
            background: 'rgba(28, 31, 38, 0.98)', /* Secondary（影墨）*/
            borderColor: 'rgba(255, 255, 255, 0.08)',
            color: '#f7f8ff',
          },
          popover: {
            background: 'rgba(28, 31, 38, 0.97)', /* Secondary（影墨）*/
            borderColor: 'rgba(255, 255, 255, 0.06)',
            shadow: '0 30px 80px rgba(28, 31, 38, 0.75)',
          },
          modal: {
            background: 'rgba(28, 31, 38, 0.98)', /* Secondary（影墨）*/
            borderRadius: '20px',
            padding: '1.75rem',
            shadow: '0 45px 140px rgba(28, 31, 38, 0.9)',
          },
          navigation: {
            shadow: '0 18px 65px rgba(28, 31, 38, 0.75)',
          },
        },
      },
      light: {
        surface: SURFACE_LIGHT,
        primary: {
          color: PRIMARY[500],
          contrastColor: '#ffffff',
          hoverColor: PRIMARY[400],
          activeColor: PRIMARY[600],
        },
        highlight: {
          background: 'rgba(174, 183, 198, 0.12)', /* Accent（銀月）*/
          focusBackground: 'rgba(109, 136, 168, 0.2)', /* Highlight（薄藍）*/
          color: TEXT_CHARCOAL,
          focusColor: TEXT_DEEP_NAVY,
        },
        mask: {
          background: 'rgba(28, 31, 38, 0.35)', /* Secondary（影墨）*/
          color: '#0F1114',
        },
        formField: FORM_FIELD_LIGHT,
        text: {
          color: TEXT_CHARCOAL,
          hoverColor: TEXT_DEEP_NAVY,
          mutedColor: '#546e7a',
          hoverMutedColor: '#455a64',
        },
        content: {
          background: PRIMARY[50], /* Paper（和纸）*/
          hoverBackground: PRIMARY[200], /* Primary（月白）*/
          borderColor: 'rgba(233, 237, 245, 0.3)',
          color: TEXT_CHARCOAL,
          hoverColor: TEXT_DEEP_NAVY,
        },
      },
    },
  },
  components: {
    badge: {
      root: {
        borderRadius: '{border.radius.full}',
        fontSize: '10px',
        fontWeight: '600',
        minWidth: '1rem',
        height: '1rem',
        padding: '0 0.25rem',
        gap: '0.25rem',
      },
      value: {
        lineHeight: '1',
      },
    },
    toast: {
      root: {
        borderRadius: '0',
        background: 'transparent',
        padding: '0',
        gap: '0.75rem',
      },
      message: {
        gap: '0',
        padding: '1rem 1.25rem',
        margin: '0',
      },
      content: {
        gap: '1rem',
        padding: '0',
        display: 'flex',
        alignItems: 'flex-start',
      },
      icon: {
        size: '1.5rem',
        color: '{content.color}',
      },
      text: {
        color: '{content.color}',
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      },
      summary: {
        fontWeight: '600',
        fontSize: '0.9375rem',
        lineHeight: '1.4',
        color: '{content.color}',
        margin: '0',
      },
      detail: {
        color: '{content.color}',
        opacity: '0.75',
        fontSize: '0.875rem',
        lineHeight: '1.5',
        margin: '0',
      },
      closeButton: {
        size: '1.25rem',
        borderRadius: '{border.radius.full}',
        color: '{content.color}',
        opacity: '0.6',
        hoverOpacity: '1',
        hoverBackground: 'transparent',
        focusRing: {
          width: '0',
          style: 'none',
        },
        transitionDuration: '0.2s',
        gap: '0',
      },
      closeIcon: {
        size: '0.875rem',
      },
      transition: {
        enterFromClass: 'opacity-0 translate-y-[-1rem]',
        enterActiveClass: 'transition-all duration-300 ease-out',
        leaveToClass: 'opacity-0 translate-y-[-0.5rem] scale-95',
        leaveActiveClass: 'transition-all duration-300 ease-in',
      },
    },
  },
  css: CUSTOM_CSS,
});

export default TsukuyomiPreset;

