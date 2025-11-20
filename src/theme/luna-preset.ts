import { definePreset, type ColorScale } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

const PRIMARY: ColorScale = {
  50: '#f5f2ff',
  100: '#ebe2ff',
  200: '#d2beff',
  300: '#b996ff',
  400: '#a06eff',
  500: '#8a4dff',
  600: '#7434f5',
  700: '#5e24d4',
  800: '#4518a1',
  900: '#2c0f6c',
  950: '#1a0942',
};

const ACCENT: ColorScale = {
  50: '#e7fffb',
  100: '#c0fff6',
  200: '#8ff9ef',
  300: '#5cefe5',
  400: '#31ded7',
  500: '#12c4c7',
  600: '#0a9fb0',
  700: '#097f8f',
  800: '#086270',
  900: '#06474f',
};

const SURFACE_DARK: ColorScale = {
  0: '#030410',
  50: '#05071a',
  100: '#080c25',
  200: '#0b1231',
  300: '#0f173d',
  400: '#121d48',
  500: '#162254',
  600: '#1c2a62',
  700: '#21316f',
  800: '#26377c',
  900: '#2d3f8d',
};

const SURFACE_LIGHT: ColorScale = {
  0: '#ffffff',
  50: '#f7f7fb',
  100: '#eff0ff',
  200: '#e0e4ff',
  300: '#d1d8ff',
  400: '#c2ccff',
  500: '#b3c0ff',
  600: '#a5b4ff',
  700: '#96a8ff',
  800: '#889cff',
  900: '#7b90ff',
};

const FORM_FIELD_DARK = {
  background: 'rgba(255, 255, 255, 0.04)',
  disabledBackground: 'rgba(255, 255, 255, 0.02)',
  filledBackground: 'rgba(138, 77, 255, 0.12)',
  filledHoverBackground: 'rgba(138, 77, 255, 0.18)',
  filledFocusBackground: 'rgba(138, 77, 255, 0.22)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  hoverBorderColor: 'rgba(255, 255, 255, 0.2)',
  focusBorderColor: 'rgba(49, 222, 215, 0.85)',
  invalidBorderColor: '#ff8fa3',
  color: '#f8f7ff',
  disabledColor: 'rgba(248, 247, 255, 0.4)',
  placeholderColor: 'rgba(248, 247, 255, 0.5)',
  invalidPlaceholderColor: '#ffb3c2',
  floatLabelColor: 'rgba(248, 247, 255, 0.45)',
  floatLabelFocusColor: ACCENT[200],
  floatLabelActiveColor: ACCENT[300],
  floatLabelInvalidColor: '#ff9db8',
  iconColor: 'rgba(248, 247, 255, 0.65)',
  shadow: '0 0 0 1px rgba(49, 222, 215, 0.2)',
};

const FORM_FIELD_LIGHT = {
  background: 'rgba(15, 20, 47, 0.05)',
  disabledBackground: 'rgba(15, 20, 47, 0.025)',
  filledBackground: 'rgba(15, 20, 47, 0.08)',
  filledHoverBackground: 'rgba(15, 20, 47, 0.12)',
  filledFocusBackground: 'rgba(15, 20, 47, 0.16)',
  borderColor: 'rgba(5, 8, 24, 0.12)',
  hoverBorderColor: 'rgba(5, 8, 24, 0.22)',
  focusBorderColor: PRIMARY[500],
  invalidBorderColor: '#d94d64',
  color: '#121632',
  disabledColor: 'rgba(18, 22, 50, 0.45)',
  placeholderColor: 'rgba(18, 22, 50, 0.6)',
  invalidPlaceholderColor: '#d94d64',
  floatLabelColor: 'rgba(18, 22, 50, 0.5)',
  floatLabelFocusColor: PRIMARY[400],
  floatLabelActiveColor: '#2d3b70',
  floatLabelInvalidColor: '#d94d64',
  iconColor: 'rgba(18, 22, 50, 0.55)',
  shadow: '0 0 0 1px rgba(138, 77, 255, 0.12)',
};

const CUSTOM_CSS = `
:root {
  --primary-color: ${PRIMARY[500]};
  --primary-color-text: #050616;
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
  --primary-opacity-10: rgba(138, 77, 255, 0.1);
  --primary-opacity-15: rgba(138, 77, 255, 0.15);
  --primary-opacity-20: rgba(138, 77, 255, 0.2);
  --primary-opacity-25: rgba(138, 77, 255, 0.25);
  --primary-opacity-30: rgba(138, 77, 255, 0.3);
  --primary-opacity-40: rgba(138, 77, 255, 0.4);
  --primary-opacity-50: rgba(138, 77, 255, 0.5);
  --primary-opacity-60: rgba(138, 77, 255, 0.6);
  --primary-opacity-70: rgba(138, 77, 255, 0.7);
  --primary-opacity-80: rgba(138, 77, 255, 0.8);
  --primary-opacity-85: rgba(138, 77, 255, 0.85);
  --primary-opacity-90: rgba(138, 77, 255, 0.9);
  --primary-opacity-95: rgba(138, 77, 255, 0.95);
  --primary-opacity-100: rgba(138, 77, 255, 1);

  --moon-opacity-30: rgba(245, 243, 255, 0.3);
  --moon-opacity-40: rgba(245, 243, 255, 0.4);
  --moon-opacity-50: rgba(245, 243, 255, 0.5);
  --moon-opacity-60: rgba(245, 243, 255, 0.6);
  --moon-opacity-70: rgba(245, 243, 255, 0.7);
  --moon-opacity-80: rgba(245, 243, 255, 0.8);
  --moon-opacity-85: rgba(245, 243, 255, 0.85);
  --moon-opacity-90: rgba(245, 243, 255, 0.9);
  --moon-opacity-95: rgba(245, 243, 255, 0.95);
  --moon-opacity-100: #fdfdff;

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
  --danger-color: #ff8fa3;
  --warning-color: #ffd27b;
}
`;

const LunaPreset = definePreset(Aura, {
  semantic: {
    primary: PRIMARY,
    secondary: ACCENT,
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'rgba(37, 211, 209, 0.7)',
      offset: '2px',
      shadow: '0 0 0 4px rgba(37, 211, 209, 0.25)',
    },
    colorScheme: {
      dark: {
        surface: SURFACE_DARK,
        primary: {
          color: PRIMARY[500],
          contrastColor: '#050616',
          hoverColor: PRIMARY[400],
          activeColor: PRIMARY[600],
        },
        highlight: {
          background: 'rgba(37, 211, 209, 0.18)',
          focusBackground: 'rgba(37, 211, 209, 0.28)',
          color: '#eaffeef',
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
          background: 'rgba(138, 77, 255, 0.15)',
          focusBackground: 'rgba(138, 77, 255, 0.25)',
          color: '#1a1444',
          focusColor: '#0f0b28',
        },
        mask: {
          background: 'rgba(5, 8, 24, 0.35)',
          color: '#050616',
        },
        formField: FORM_FIELD_LIGHT,
        text: {
          color: '#121632',
          hoverColor: '#050616',
          mutedColor: '#4d4f70',
          hoverMutedColor: '#2f3354',
        },
        content: {
          background: '#ffffff',
          hoverBackground: '#f6f7ff',
          borderColor: 'rgba(5, 8, 24, 0.08)',
          color: '#121632',
          hoverColor: '#050616',
        },
      },
    },
  },
  css: CUSTOM_CSS,
});

export default LunaPreset;

