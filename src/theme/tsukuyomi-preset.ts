import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import { PRIMARY, SURFACE_DARK, type ColorScale } from './color-tokens';

// 原始色值定义在 `./color-tokens`（不依赖 PrimeVue），此文件只消费这些 token
// 拼装 PrimeVue 主题预设；如需在 UI 以外复用色值（如 CoverService），请直接从
// `./color-tokens` 导入，避免把整个主题 bundle 拉进依赖图。

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
  /* Primary（月白）的 RGB 分量，逗号分隔：用于 rgba(var(--primary-rgb), <alpha>) */
  --primary-rgb: 233, 237, 245;
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
  /* 月光白（#FDFDFF）的 RGB 分量，逗号分隔：用于 rgba(var(--moon-rgb), <alpha>) */
  --moon-rgb: 253, 253, 255;

  --moon-opacity-5: rgba(253, 253, 255, 0.05);
  --moon-opacity-30: rgba(253, 253, 255, 0.3);
  --moon-opacity-40: rgba(253, 253, 255, 0.4);
  --moon-opacity-50: rgba(253, 253, 255, 0.5);
  --moon-opacity-55: rgba(253, 253, 255, 0.55);
  --moon-opacity-60: rgba(253, 253, 255, 0.6);
  --moon-opacity-65: rgba(253, 253, 255, 0.65);
  --moon-opacity-70: rgba(253, 253, 255, 0.7);
  --moon-opacity-75: rgba(253, 253, 255, 0.75);
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
  /* moon-100 的 RGB 分量，逗号分隔：用于 rgb(var(--moon-100-rgb)) */
  --moon-100-rgb: 240, 237, 228;
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
  --red-500: #ef4444;
  --red-500-opacity-8: rgba(239, 68, 68, 0.08);
  --red-500-opacity-10: rgba(239, 68, 68, 0.1);
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
  --green-500: #22c55e;
  --green-500-opacity-10: rgba(34, 197, 94, 0.1);
  --green-500-opacity-80: rgba(34, 197, 94, 0.8);

  /* warning / amber 透明度 */
  --color-warning-opacity-12: rgba(242, 192, 55, 0.12);
  --color-warning-opacity-30: rgba(242, 192, 55, 0.3);

  /* orange 调色（与 Tailwind / PrimeVue Aura orange-400/500 一致）*/
  --orange-400: #fb923c;
  --orange-400-opacity-12: rgba(251, 146, 60, 0.12);
  --orange-500: #f97316;

  /* primary（月白 #E9EDF5）额外透明度 */
  --primary-opacity-35: rgba(233, 237, 245, 0.35);

  /* tsukuyomi-200（#BAC9DB）额外透明度 */
  --tsukuyomi-200-opacity-24: rgba(186, 201, 219, 0.24);

  /* 等宽字体栈（与 tailwind.config.cjs fontFamily.mono 一致）*/
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;

  /*
   * ===== 按钮系统（桌面 / 平板 / 手机统一）=====
   * 单一来源：PrimeVue <Button> 的主题 token（见下方 components.button）与手写按钮的
   * 全局 .ui-btn 类都引用这些变量。要调整按钮外观，只改这里。
   * - 主按钮：薄藍淡底 + 薄藍描边 + 浅色字
   * - 次按钮（outlined / secondary）：透明底 + 细描边
   * - 文字 / 图标按钮（text）：无底无框，悬停浅底
   * - 危险：红色淡底 / 红色描边
   */
  --btn-radius: 8px;
  --btn-primary-bg: rgba(109, 136, 168, 0.18);
  --btn-primary-hover-bg: rgba(109, 136, 168, 0.28);
  --btn-primary-active-bg: rgba(109, 136, 168, 0.36);
  --btn-primary-border: rgba(163, 183, 207, 0.4);
  --btn-primary-hover-border: rgba(163, 183, 207, 0.55);
  --btn-primary-color: ${ACCENT_TEAL[100]};
  --btn-primary-hover-color: ${ACCENT_TEAL[50]};
  --btn-ghost-hover-bg: rgba(255, 255, 255, 0.04);
  --btn-ghost-active-bg: rgba(255, 255, 255, 0.08);
  --btn-ghost-border: rgba(255, 255, 255, 0.12);
  --btn-ghost-hover-border: rgba(255, 255, 255, 0.2);
  --btn-ghost-color: rgba(247, 244, 236, 0.8);
  --btn-ghost-hover-color: #f7f4ec;
  --btn-text-color: rgba(247, 244, 236, 0.72);
  --btn-text-hover-bg: rgba(255, 255, 255, 0.05);
  --btn-text-active-bg: rgba(255, 255, 255, 0.09);
  --btn-text-hover-color: #f7f4ec;
  --btn-danger-bg: rgba(239, 95, 95, 0.12);
  --btn-danger-hover-bg: rgba(239, 95, 95, 0.2);
  --btn-danger-border: rgba(239, 95, 95, 0.35);
  --btn-danger-color: ${DANGER[400]};
  --btn-success-bg: rgba(127, 179, 137, 0.14);
  --btn-success-hover-bg: rgba(127, 179, 137, 0.22);
  --btn-success-border: rgba(127, 179, 137, 0.4);
  --btn-success-color: ${SUCCESS[300]};
  --btn-warn-bg: rgba(242, 192, 55, 0.12);
  --btn-warn-hover-bg: rgba(242, 192, 55, 0.2);
  --btn-warn-border: rgba(242, 192, 55, 0.35);
  --btn-warn-color: ${WARNING[200]};
}

/*
 * 手写按钮的统一外观（与 PrimeVue <Button> 主题同一组变量）。
 * 用法：<button class="ui-btn ui-btn--primary">、ui-btn--ghost、ui-btn--text、ui-btn--danger，
 * 尺寸 ui-btn--sm，纯图标 ui-btn--icon。组件里只补布局（flex、宽度），不要再写颜色。
 */
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.25rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid transparent;
  border-radius: var(--btn-radius);
  background: transparent;
  color: var(--btn-text-color);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}
.ui-btn .pi {
  font-size: 0.9em;
}
.ui-btn--sm {
  min-height: 2rem;
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
}
.ui-btn--icon {
  padding-left: 0;
  padding-right: 0;
  aspect-ratio: 1;
}

/*
 * 搜索框：InputGroup（搜索图标 addon + InputText + 可选清除按钮 addon）加 class ui-search，
 * 高度与 PrimeVue 默认按钮相同，ui-search--sm 与 p-button-sm 相同
 * （按钮高度 = 字号 × 行高 1.5 + 上下内边距 + 1px 边框 × 2，取值见下方按钮 token）。
 * PrimeVue 默认输入框 1rem 字号、约 42px 高，放在按钮旁明显偏大。
 */
.ui-search.p-inputgroup {
  height: calc(0.875rem * 1.5 + 0.45rem * 2 + 2px);
}
.ui-search .p-inputtext {
  height: 100%;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 0.875rem;
}
.ui-search .p-inputgroupaddon {
  min-width: 2.25rem;
  padding: 0 0.6rem;
}
.ui-search .p-inputgroupaddon .pi {
  font-size: 0.85rem;
}
.ui-search .p-inputgroupaddon .p-button {
  width: 1.75rem;
  height: 1.75rem;
}
.ui-search--sm.p-inputgroup {
  height: calc(0.8rem * 1.5 + 0.3rem * 2 + 2px);
}
.ui-search--sm .p-inputtext {
  font-size: 0.8rem;
}
.ui-search--sm .p-inputgroupaddon {
  min-width: 2rem;
  padding: 0 0.5rem;
}
.ui-search--sm .p-inputgroupaddon .p-button {
  width: 1.5rem;
  height: 1.5rem;
}
.ui-btn--primary {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-border);
  color: var(--btn-primary-color);
}
.ui-btn--primary:hover:not(:disabled) {
  background: var(--btn-primary-hover-bg);
  border-color: var(--btn-primary-hover-border);
  color: var(--btn-primary-hover-color);
}
.ui-btn--primary:active:not(:disabled) {
  background: var(--btn-primary-active-bg);
}
.ui-btn--ghost {
  border-color: var(--btn-ghost-border);
  color: var(--btn-ghost-color);
}
.ui-btn--ghost:hover:not(:disabled) {
  background: var(--btn-ghost-hover-bg);
  border-color: var(--btn-ghost-hover-border);
  color: var(--btn-ghost-hover-color);
}
.ui-btn--text:hover:not(:disabled) {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}
.ui-btn--text:active:not(:disabled) {
  background: var(--btn-text-active-bg);
}
.ui-btn--danger {
  border-color: var(--btn-danger-border);
  color: var(--btn-danger-color);
}
.ui-btn--danger:hover:not(:disabled) {
  background: var(--btn-danger-bg);
}
.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible {
  outline: 2px solid rgba(109, 136, 168, 0.6);
  outline-offset: 2px;
}

/*
 * 顶部系统栏弹层（任务 / 同步 / 消息）的统一外壳。
 * Popover 加 class header-popover；内容用 hp-panel 包住，依次是 hp-head（标题 + 说明 + 图标按钮）、
 * hp-scroll（可滚动正文）、可选的 hp-foot（底部操作）。三个弹层同宽、同标题栏、同内边距。
 */
.header-popover.p-popover {
  width: min(420px, 94vw);
}
.header-popover .p-popover-content {
  padding: 0;
}
.hp-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(600px, calc(100dvh - 96px));
  color: var(--moon-opacity-90);
}
.hp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 46px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--white-opacity-8);
  flex-shrink: 0;
}
.hp-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.hp-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--moon-opacity-50);
}
.hp-spacer {
  flex: 1;
}
.hp-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--btn-text-color);
  cursor: pointer;
}
.hp-icon-btn i {
  font-size: 12px;
}
.hp-icon-btn:hover:not(:disabled) {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}
.hp-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.hp-icon-btn--active {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
}
.hp-icon-btn--danger:hover:not(:disabled) {
  background: var(--btn-danger-bg);
  color: var(--btn-danger-color);
}
.hp-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
.hp-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--white-opacity-8);
  flex-shrink: 0;
}

/*
 * 从按钮弹出的 Popover（useAnchoredPopover）：箭头按 --anchored-arrow-x 对准按钮中心。
 * 两个伪元素都以 left 为中心（各自用负 margin 居中），未设置变量时沿用 PrimeVue 的算法。
 */
.anchored-popover::before,
.anchored-popover::after {
  left: var(
    --anchored-arrow-x,
    calc(var(--p-popover-arrow-offset) + var(--p-popover-arrow-left))
  ) !important;
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

/* 按钮系统：与 .ui-btn 同字号（PrimeVue 默认 1rem 偏大）。
   用双类选择器压过 PrimeVue 自带的 .p-button / .p-button-sm 规则，不受样式注入顺序影响 */
.p-component.p-button {
  font-size: 0.875rem;
}

.p-component.p-button.p-button-sm {
  font-size: 0.8rem;
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

// PrimeVue 语义主色：薄藍。开关、勾选框、单选、滑块、进度条、选中态等都取这里，
// 与按钮系统（--btn-primary-*）同一色相。月白 PRIMARY 仍用于自定义的 --primary-* 变量。
const PRIMEVUE_PRIMARY: ColorScale = { ...ACCENT_TEAL, 950: '#1D3858' };

const TsukuyomiPreset = definePreset(Aura, {
  semantic: {
    primary: PRIMEVUE_PRIMARY,
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
          color: ACCENT_TEAL[400],
          contrastColor: '#1C1F26', /* Secondary（影墨）*/
          hoverColor: ACCENT_TEAL[300],
          activeColor: ACCENT_TEAL[500],
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
    button: {
      root: {
        borderRadius: 'var(--btn-radius)',
        gap: '0.45rem',
        paddingX: '0.9rem',
        paddingY: '0.45rem',
        iconOnlyWidth: '2.25rem',
        sm: { fontSize: '0.8rem', paddingX: '0.65rem', paddingY: '0.3rem', iconOnlyWidth: '2rem' },
        label: { fontWeight: '500' },
      },
      colorScheme: {
        dark: {
          root: {
            primary: {
              background: 'var(--btn-primary-bg)',
              hoverBackground: 'var(--btn-primary-hover-bg)',
              activeBackground: 'var(--btn-primary-active-bg)',
              borderColor: 'var(--btn-primary-border)',
              hoverBorderColor: 'var(--btn-primary-hover-border)',
              activeBorderColor: 'var(--btn-primary-hover-border)',
              color: 'var(--btn-primary-color)',
              hoverColor: 'var(--btn-primary-hover-color)',
              activeColor: 'var(--btn-primary-hover-color)',
              focusRing: { color: ACCENT_TEAL[400], shadow: 'none' },
            },
            secondary: {
              background: 'var(--btn-ghost-hover-bg)',
              hoverBackground: 'var(--btn-ghost-active-bg)',
              activeBackground: 'var(--btn-ghost-active-bg)',
              borderColor: 'var(--btn-ghost-border)',
              hoverBorderColor: 'var(--btn-ghost-hover-border)',
              activeBorderColor: 'var(--btn-ghost-hover-border)',
              color: 'var(--btn-ghost-color)',
              hoverColor: 'var(--btn-ghost-hover-color)',
              activeColor: 'var(--btn-ghost-hover-color)',
              focusRing: { color: ACCENT_TEAL[400], shadow: 'none' },
            },
            info: {
              background: 'var(--btn-primary-bg)',
              hoverBackground: 'var(--btn-primary-hover-bg)',
              activeBackground: 'var(--btn-primary-active-bg)',
              borderColor: 'var(--btn-primary-border)',
              hoverBorderColor: 'var(--btn-primary-hover-border)',
              activeBorderColor: 'var(--btn-primary-hover-border)',
              color: 'var(--btn-primary-color)',
              hoverColor: 'var(--btn-primary-hover-color)',
              activeColor: 'var(--btn-primary-hover-color)',
              focusRing: { color: ACCENT_TEAL[400], shadow: 'none' },
            },
            success: {
              background: 'var(--btn-success-bg)',
              hoverBackground: 'var(--btn-success-hover-bg)',
              activeBackground: 'var(--btn-success-hover-bg)',
              borderColor: 'var(--btn-success-border)',
              hoverBorderColor: 'var(--btn-success-border)',
              activeBorderColor: 'var(--btn-success-border)',
              color: 'var(--btn-success-color)',
              hoverColor: 'var(--btn-success-color)',
              activeColor: 'var(--btn-success-color)',
              focusRing: { color: SUCCESS[300], shadow: 'none' },
            },
            warn: {
              background: 'var(--btn-warn-bg)',
              hoverBackground: 'var(--btn-warn-hover-bg)',
              activeBackground: 'var(--btn-warn-hover-bg)',
              borderColor: 'var(--btn-warn-border)',
              hoverBorderColor: 'var(--btn-warn-border)',
              activeBorderColor: 'var(--btn-warn-border)',
              color: 'var(--btn-warn-color)',
              hoverColor: 'var(--btn-warn-color)',
              activeColor: 'var(--btn-warn-color)',
              focusRing: { color: WARNING[200], shadow: 'none' },
            },
            danger: {
              background: 'var(--btn-danger-bg)',
              hoverBackground: 'var(--btn-danger-hover-bg)',
              activeBackground: 'var(--btn-danger-hover-bg)',
              borderColor: 'var(--btn-danger-border)',
              hoverBorderColor: 'var(--btn-danger-border)',
              activeBorderColor: 'var(--btn-danger-border)',
              color: 'var(--btn-danger-color)',
              hoverColor: 'var(--btn-danger-color)',
              activeColor: 'var(--btn-danger-color)',
              focusRing: { color: DANGER[400], shadow: 'none' },
            },
          },
          outlined: {
            primary: {
              hoverBackground: 'var(--btn-ghost-hover-bg)',
              activeBackground: 'var(--btn-ghost-active-bg)',
              borderColor: 'var(--btn-ghost-border)',
              color: 'var(--btn-ghost-color)',
            },
            secondary: {
              hoverBackground: 'var(--btn-ghost-hover-bg)',
              activeBackground: 'var(--btn-ghost-active-bg)',
              borderColor: 'var(--btn-ghost-border)',
              color: 'var(--btn-ghost-color)',
            },
            plain: {
              hoverBackground: 'var(--btn-ghost-hover-bg)',
              activeBackground: 'var(--btn-ghost-active-bg)',
              borderColor: 'var(--btn-ghost-border)',
              color: 'var(--btn-ghost-color)',
            },
            success: {
              hoverBackground: 'var(--btn-success-bg)',
              activeBackground: 'var(--btn-success-hover-bg)',
              borderColor: 'var(--btn-success-border)',
              color: 'var(--btn-success-color)',
            },
            warn: {
              hoverBackground: 'var(--btn-warn-bg)',
              activeBackground: 'var(--btn-warn-hover-bg)',
              borderColor: 'var(--btn-warn-border)',
              color: 'var(--btn-warn-color)',
            },
            danger: {
              hoverBackground: 'var(--btn-danger-bg)',
              activeBackground: 'var(--btn-danger-hover-bg)',
              borderColor: 'var(--btn-danger-border)',
              color: 'var(--btn-danger-color)',
            },
          },
          text: {
            primary: {
              hoverBackground: 'var(--btn-text-hover-bg)',
              activeBackground: 'var(--btn-text-active-bg)',
              color: 'var(--btn-text-color)',
            },
            secondary: {
              hoverBackground: 'var(--btn-text-hover-bg)',
              activeBackground: 'var(--btn-text-active-bg)',
              color: 'var(--btn-text-color)',
            },
            plain: {
              hoverBackground: 'var(--btn-text-hover-bg)',
              activeBackground: 'var(--btn-text-active-bg)',
              color: 'var(--btn-text-color)',
            },
            success: {
              hoverBackground: 'var(--btn-success-bg)',
              activeBackground: 'var(--btn-success-hover-bg)',
              color: 'var(--btn-success-color)',
            },
            warn: {
              hoverBackground: 'var(--btn-warn-bg)',
              activeBackground: 'var(--btn-warn-hover-bg)',
              color: 'var(--btn-warn-color)',
            },
            danger: {
              hoverBackground: 'var(--btn-danger-bg)',
              activeBackground: 'var(--btn-danger-hover-bg)',
              color: 'var(--btn-danger-color)',
            },
          },
          link: {
            color: ACCENT_TEAL[300],
            hoverColor: ACCENT_TEAL[200],
            activeColor: ACCENT_TEAL[200],
          },
        },
      },
    },
    // 分段选择（SelectButton / ToggleButton）：浅色轨道 + 选中段用主按钮的薄藍淡底
    togglebutton: {
      root: { borderRadius: 'var(--btn-radius)', padding: '0.2rem' },
      content: { borderRadius: '6px', checkedShadow: 'none' },
      colorScheme: {
        dark: {
          root: {
            background: 'rgba(255, 255, 255, 0.04)',
            checkedBackground: 'rgba(255, 255, 255, 0.04)',
            hoverBackground: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            checkedBorderColor: 'rgba(255, 255, 255, 0.1)',
            color: 'var(--btn-text-color)',
            hoverColor: 'var(--btn-text-hover-color)',
            checkedColor: 'var(--btn-primary-color)',
          },
          content: { checkedBackground: 'var(--btn-primary-bg)' },
          icon: {
            color: 'var(--btn-text-color)',
            hoverColor: 'var(--btn-text-hover-color)',
            checkedColor: 'var(--btn-primary-color)',
          },
        },
      },
    },
    // 状态标签（Tag）：与按钮同一套「淡底 + 有色文字」，不用 Aura 默认的实心灰块
    tag: {
      root: {
        fontSize: '0.7rem',
        fontWeight: '600',
        padding: '0.15rem 0.5rem',
        gap: '0.25rem',
        borderRadius: '6px',
      },
      colorScheme: {
        dark: {
          primary: { background: 'rgba(109, 136, 168, 0.18)', color: ACCENT_TEAL[100] },
          secondary: { background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(247, 244, 236, 0.7)' },
          success: { background: 'rgba(127, 194, 155, 0.14)', color: '#9fd3b4' },
          info: { background: 'rgba(163, 183, 207, 0.16)', color: '#c9d6e4' },
          warn: { background: 'rgba(231, 201, 138, 0.14)', color: '#e7c98a' },
          danger: { background: 'rgba(240, 163, 163, 0.14)', color: '#f0a3a3' },
          contrast: { background: 'rgba(247, 244, 236, 0.9)', color: '#1c1f26' },
        },
      },
    },
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

