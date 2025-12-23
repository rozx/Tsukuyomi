import { definePreset, type ColorScale } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

// Tsukuyomi（月詠）主题色
// Primary（月白）: #E9EDF5
const PRIMARY: ColorScale = {
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

// Secondary（影墨）: #1C1F26
const SURFACE_DARK: ColorScale = {
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
  
  /* Translation text color - Highlight（薄藍）*/
  --translation-text-color: rgba(109, 136, 168, 0.9);
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

