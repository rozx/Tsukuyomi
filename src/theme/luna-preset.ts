import { definePreset, type ColorScale } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

// Base tones: Soft gray (#ECEFF1), Pearl white (#FDFDFD)
const PRIMARY: ColorScale = {
  50: '#fdfdff', // Pearl white
  100: '#fafbfd',
  200: '#eceff1', // Soft gray
  300: '#d5d9dd',
  400: '#bdc4cb',
  500: '#a5afb9',
  600: '#8d9aa7',
  700: '#758595',
  800: '#5d7083',
  900: '#455b71',
  950: '#2d475f',
};

const ACCENT: ColorScale = {
  50: '#f3e5f5',
  100: '#e1bee7',
  200: '#ce93d8',
  300: '#ba68c8',
  400: '#b39ddb',
  500: '#9575cd',
  600: '#7e57c2',
  700: '#673ab7',
  800: '#5e35b1',
  900: '#512da8',
};

const ACCENT_TEAL: ColorScale = {
  50: '#e0f7fa',
  100: '#b2ebf2',
  200: '#80deea',
  300: '#4dd0e1',
  400: '#26c6da',
  500: '#00bcd4',
  600: '#00acc1',
  700: '#0097a7',
  800: '#00838f',
  900: '#006064',
};

// Text colors: charcoal or deep navy for contrast
const TEXT_CHARCOAL = '#36454f'; // Charcoal
const TEXT_DEEP_NAVY = '#1a237e'; // Deep navy
const TEXT_DARK = '#212121'; // Dark for light backgrounds

const SURFACE_DARK: ColorScale = {
  0: '#1a1a1a',
  50: '#212121',
  100: '#263238',
  200: '#2c3e43',
  300: '#37474f',
  400: '#455a64',
  500: '#546e7a',
  600: '#607d8b',
  700: '#78909c',
  800: '#90a4ae',
  900: '#b0bec5',
};

const SURFACE_LIGHT: ColorScale = {
  0: '#fdfdff',
  50: '#fafafa',
  100: '#f5f5f5',
  200: '#eceff1',
  300: '#e0e0e0',
  400: '#cfd8dc',
  500: '#bdbdbd',
  600: '#9e9e9e',
  700: '#757575',
  800: '#616161',
  900: '#424242',
};

const FORM_FIELD_DARK = {
  background: 'rgba(255, 255, 255, 0.04)',
  disabledBackground: 'rgba(255, 255, 255, 0.02)',
  filledBackground: 'rgba(236, 239, 241, 0.08)',
  filledHoverBackground: 'rgba(236, 239, 241, 0.12)',
  filledFocusBackground: 'rgba(236, 239, 241, 0.16)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  hoverBorderColor: 'rgba(255, 255, 255, 0.2)',
  focusBorderColor: 'rgba(179, 157, 219, 0.6)',
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
  shadow: '0 0 0 1px rgba(128, 222, 234, 0.2)', // Icy teal glow
};

const FORM_FIELD_LIGHT = {
  background: 'rgba(236, 239, 241, 0.5)',
  disabledBackground: 'rgba(236, 239, 241, 0.25)',
  filledBackground: 'rgba(236, 239, 241, 0.7)',
  filledHoverBackground: 'rgba(236, 239, 241, 0.85)',
  filledFocusBackground: 'rgba(236, 239, 241, 0.95)',
  borderColor: 'rgba(236, 239, 241, 0.5)',
  hoverBorderColor: 'rgba(236, 239, 241, 0.7)',
  focusBorderColor: ACCENT[400], // Lavender for subtle emphasis
  invalidBorderColor: '#d94d64',
  color: TEXT_CHARCOAL,
  disabledColor: 'rgba(54, 69, 79, 0.45)',
  placeholderColor: 'rgba(54, 69, 79, 0.6)',
  invalidPlaceholderColor: '#d94d64',
  floatLabelColor: 'rgba(54, 69, 79, 0.5)',
  floatLabelFocusColor: ACCENT[400], // Lavender
  floatLabelActiveColor: TEXT_DEEP_NAVY,
  floatLabelInvalidColor: '#d94d64',
  iconColor: 'rgba(54, 69, 79, 0.55)',
  shadow: '0 0 0 1px rgba(179, 157, 219, 0.15)', // Lavender glow
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
  --primary-opacity-10: rgba(236, 239, 241, 0.1);
  --primary-opacity-15: rgba(236, 239, 241, 0.15);
  --primary-opacity-20: rgba(236, 239, 241, 0.2);
  --primary-opacity-25: rgba(236, 239, 241, 0.25);
  --primary-opacity-30: rgba(236, 239, 241, 0.3);
  --primary-opacity-40: rgba(236, 239, 241, 0.4);
  --primary-opacity-50: rgba(236, 239, 241, 0.5);
  --primary-opacity-60: rgba(236, 239, 241, 0.6);
  --primary-opacity-70: rgba(236, 239, 241, 0.7);
  --primary-opacity-80: rgba(236, 239, 241, 0.8);
  --primary-opacity-85: rgba(236, 239, 241, 0.85);
  --primary-opacity-90: rgba(236, 239, 241, 0.9);
  --primary-opacity-95: rgba(236, 239, 241, 0.95);
  --primary-opacity-100: rgba(236, 239, 241, 1);
  
  --soft-gray: ${PRIMARY[200]};
  --pearl-white: ${PRIMARY[50]};

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
  
  --accent-lavender: ${ACCENT[400]};
  --accent-teal: ${ACCENT_TEAL[200]};

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

  --black-opacity-10: rgba(5, 8, 24, 0.1);
  --black-opacity-15: rgba(5, 8, 24, 0.15);
  --black-opacity-20: rgba(5, 8, 24, 0.2);
  --black-opacity-30: rgba(5, 8, 24, 0.3);
  --black-opacity-50: rgba(5, 8, 24, 0.5);
  --black-opacity-80: rgba(5, 8, 24, 0.8);

  --accent-color: ${ACCENT[400]};
  --accent-teal-color: ${ACCENT_TEAL[200]};
  --danger-color: #ff8fa3;
  --warning-color: #ffd27b;
  
  /* Translation text color - Luna pink */
  --translation-text-color: rgba(240, 69, 139, 0.9);
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

/* Success Toast - Icy Teal */
.p-toast .p-toast-message[data-p-severity="success"],
.p-toast .p-toast-message.p-severity-success,
.p-toast-message-success {
  background: linear-gradient(135deg, rgba(128, 222, 234, 0.25) 0%, rgba(128, 222, 234, 0.15) 100%) !important;
  background-color: rgba(7, 10, 27, 0.92) !important;
  border-color: ${ACCENT_TEAL[300]} !important;
  border-left-width: 4px !important;
}

.p-toast .p-toast-message[data-p-severity="success"] .p-toast-message-icon,
.p-toast .p-toast-message.p-severity-success .p-toast-message-icon,
.p-toast-message-success .p-toast-message-icon,
.p-toast-message-success [class*="icon"]:not(.p-toast-icon-close) {
  color: ${ACCENT_TEAL[200]} !important;
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

/* Info Toast - Lavender */
.p-toast .p-toast-message[data-p-severity="info"],
.p-toast .p-toast-message.p-severity-info,
.p-toast-message-info {
  background: linear-gradient(135deg, rgba(179, 157, 219, 0.25) 0%, rgba(179, 157, 219, 0.15) 100%) !important;
  background-color: rgba(7, 10, 27, 0.92) !important;
  border-color: ${ACCENT[400]} !important;
  border-left-width: 4px !important;
}

.p-toast .p-toast-message[data-p-severity="info"] .p-toast-message-icon,
.p-toast .p-toast-message.p-severity-info .p-toast-message-icon,
.p-toast-message-info .p-toast-message-icon,
.p-toast-message-info [class*="icon"]:not(.p-toast-icon-close) {
  color: ${ACCENT[400]} !important;
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
  background-color: rgba(7, 10, 27, 0.92) !important;
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
  background-color: rgba(7, 10, 27, 0.92) !important;
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

const LunaPreset = definePreset(Aura, {
  semantic: {
    primary: PRIMARY,
    secondary: ACCENT,
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'rgba(128, 222, 234, 0.6)',
      offset: '2px',
      shadow: '0 0 0 4px rgba(179, 157, 219, 0.2)',
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
          background: 'rgba(128, 222, 234, 0.15)',
          focusBackground: 'rgba(179, 157, 219, 0.25)',
          color: '#e0f7fa',
          focusColor: '#ffffff',
        },
        mask: {
          background: 'rgba(5, 8, 24, 0.82)',
          color: '#050616',
        },
        formField: FORM_FIELD_DARK,
        text: {
          color: '#f5f7ff',
          hoverColor: '#ffffff',
          mutedColor: 'rgba(245, 243, 255, 0.7)',
          hoverMutedColor: '#ffffff',
        },
        content: {
          background: 'rgba(6, 8, 24, 0.85)',
          hoverBackground: 'rgba(6, 8, 24, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          color: '#f8f7ff',
          hoverColor: '#ffffff',
        },
        overlay: {
          select: {
            background: 'rgba(5, 8, 24, 0.98)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            color: '#f7f8ff',
          },
          popover: {
            background: 'rgba(7, 9, 28, 0.97)',
            borderColor: 'rgba(255, 255, 255, 0.06)',
            shadow: '0 30px 80px rgba(5, 8, 24, 0.75)',
          },
          modal: {
            background: 'rgba(7, 10, 27, 0.98)',
            borderRadius: '20px',
            padding: '1.75rem',
            shadow: '0 45px 140px rgba(5, 8, 24, 0.9)',
          },
          navigation: {
            shadow: '0 18px 65px rgba(5, 8, 24, 0.75)',
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
          background: 'rgba(179, 157, 219, 0.12)', // Lavender for subtle emphasis
          focusBackground: 'rgba(128, 222, 234, 0.2)', // Icy teal for subtle emphasis
          color: TEXT_CHARCOAL,
          focusColor: TEXT_DEEP_NAVY,
        },
        mask: {
          background: 'rgba(5, 8, 24, 0.35)',
          color: '#050616',
        },
        formField: FORM_FIELD_LIGHT,
        text: {
          color: TEXT_CHARCOAL,
          hoverColor: TEXT_DEEP_NAVY,
          mutedColor: '#546e7a',
          hoverMutedColor: '#455a64',
        },
        content: {
          background: PRIMARY[50], // Pearl white
          hoverBackground: PRIMARY[200], // Soft gray
          borderColor: 'rgba(236, 239, 241, 0.3)',
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

export default LunaPreset;

