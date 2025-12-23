/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E9EDF5', // Primary（月白）
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
        accent: {
          DEFAULT: '#AEB7C6', // Accent（銀月）
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
        },
        accentTeal: {
          DEFAULT: '#6D88A8', // Highlight（薄藍）
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
        },
        // Theme text colors
        textCharcoal: {
          DEFAULT: '#36454f',
        },
        textDeepNavy: {
          DEFAULT: '#1a237e',
        },
        // Icon colors - for icons and highlights, use accent instead of primary
        icon: {
          DEFAULT: '#AEB7C6', // Accent（銀月）- main icon color
          blue: '#6D88A8', // Highlight（薄藍）- secondary icon color
          accent: '#AEB7C6', // Alias for silver
        },
        night: {
          50: '#2C2F3A',
          100: '#242730',
          200: '#1C1F26', // Secondary（影墨）
          300: '#14161A',
          400: '#0F1114',
          500: '#0A0C0F',
          600: '#050608',
          700: '#030405',
          800: '#020303',
          900: '#010202',
          950: '#000101',
        },
        moon: {
          50: '#F7F4EC', // Paper（和纸）
          100: '#F0EDE4',
          200: '#E9EDF5', // Primary（月白）
          300: '#E2DFD4',
          400: '#DBD8CC',
          500: '#D4D1C4',
          600: '#CDCAAC',
          700: '#C6C394',
          800: '#BFBC7C',
          900: '#B8B564',
        },
        tsukuyomi: {
          DEFAULT: '#6D88A8', // Highlight（薄藍）
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
          950: '#1D3858',
        },
        warning: {
          DEFAULT: '#f2c037',
        },
      },
      backgroundImage: {
        'tsukuyomi-gradient':
          'radial-gradient(900px circle at 75% -10%, rgba(174,183,198,0.25), transparent 60%), radial-gradient(720px circle at 12% 115%, rgba(109,136,168,0.2), transparent 45%)',
      },
    },
  },
  plugins: [
    function ({ addUtilities, theme }) {
      const newUtilities = {
        '.bg-luna-stars': {
          backgroundColor: theme('colors.night.950'),
          backgroundImage:
            'radial-gradient(1px 1px at 15px 25px, rgba(255,255,255,0.85) 50%, transparent 51%), radial-gradient(1px 1px at 90px 140px, rgba(118,180,255,0.7) 50%, transparent 51%), radial-gradient(1px 1px at 210px 90px, rgba(255,255,255,0.65) 50%, transparent 51%), radial-gradient(1px 1px at 330px 210px, rgba(118,180,255,0.75) 50%, transparent 51%)',
          backgroundSize: '220px 220px',
          backgroundRepeat: 'repeat',
        },
        '.bg-tsukuyomi-sky': {
          backgroundImage:
            'radial-gradient(circle at 15% 15%, rgba(109, 136, 168, 0.35), transparent 45%), radial-gradient(circle at 85% 10%, rgba(174, 183, 198, 0.28), transparent 50%), radial-gradient(circle at 25% 50%, rgba(109, 136, 168, 0.15), transparent 55%), radial-gradient(circle at 75% 50%, rgba(174, 183, 198, 0.18), transparent 60%), radial-gradient(circle at 10% 85%, rgba(109, 136, 168, 0.12), transparent 65%), radial-gradient(circle at 90% 90%, rgba(174, 183, 198, 0.15), transparent 70%), radial-gradient(circle at 50% 50%, rgba(233, 237, 245, 0.05), transparent 75%), linear-gradient(135deg, #0A0C0F 0%, #0F1114 20%, #1C1F26 50%, #242730 80%, #2C2F3A 100%)',
          backgroundAttachment: 'fixed',
        },
        '.card-base': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)', // Transparent with subtle white overlay for dark theme
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        },
        '.card-header': {
          backgroundColor: 'rgba(255, 255, 255, 0.035)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '1rem 1.25rem',
        },
        '.card-content': {
          backgroundColor: 'rgba(6, 8, 24, 0.85)',
          padding: '1.5rem',
        },
        '.card-footer': {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          padding: '1rem 1.5rem',
        },
        '.input-group-base': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          borderRadius: '12px',
        },
        '.list-item-base': {
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        '.list-item-hover': {
          backgroundColor: 'rgba(37, 211, 209, 0.12)',
          borderColor: 'rgba(37, 211, 209, 0.45)',
        },
        '.list-item-selected': {
          backgroundColor: 'rgba(179, 157, 219, 0.15)',
          borderColor: 'rgba(179, 157, 219, 0.4)',
          boxShadow: '0 8px 24px rgba(179, 157, 219, 0.25)',
        },
        // Theme-based surface colors using Soft gray (#ECEFF1) and Pearl white (#FDFDFD)
        '.bg-surface-subtle': {
          backgroundColor: 'rgba(233, 237, 245, 0.05)', // Primary（月白）
        },
        '.bg-surface-light': {
          backgroundColor: 'rgba(233, 237, 245, 0.1)',
        },
        '.bg-surface-medium': {
          backgroundColor: 'rgba(233, 237, 245, 0.15)',
        },
        '.bg-surface-strong': {
          backgroundColor: 'rgba(233, 237, 245, 0.2)',
        },
        '.bg-surface-card': {
          backgroundColor: 'rgba(247, 244, 236, 0.8)', // Paper（和纸）with transparency
        },
        '.border-surface-subtle': {
          borderColor: 'rgba(233, 237, 245, 0.2)', // Primary（月白）
        },
        '.border-surface-light': {
          borderColor: 'rgba(233, 237, 245, 0.3)',
        },
        '.border-surface-medium': {
          borderColor: 'rgba(233, 237, 245, 0.4)',
        },
        '.border-surface-strong': {
          borderColor: 'rgba(233, 237, 245, 0.5)',
        },
        // Icon colors - use accent (Silver) for icons instead of primary (Moon white)
        '.text-icon': {
          color: '#AEB7C6', // Accent（銀月）for icons
        },
        '.text-icon-blue': {
          color: '#6D88A8', // Highlight（薄藍）for secondary icons
        },
        // Luna theme colors
        '.text-tsukuyomi': {
          color: '#6D88A8', // Highlight（薄藍）
        },
        '.bg-tsukuyomi': {
          backgroundColor: '#6D88A8', // Highlight（薄藍）
        },
        '.border-tsukuyomi': {
          borderColor: '#6D88A8', // Highlight（薄藍）
        },
        // Translation text color (distinct from original text)
        '.text-translation': {
          color: 'rgba(109, 136, 168, 0.9)', // Highlight（薄藍）with 90% opacity for translations
        },
        // Search input group - ensures search box can shrink and buttons stay on same line
        '.search-input-group': {
          minWidth: '0',
          flex: '1 1 auto',
          maxWidth: '400px',
        },
        // Input action addon - for clear/copy buttons in input groups
        '.input-action-addon': {
          padding: '0 !important',
          display: 'flex !important',
          alignItems: 'stretch !important',
          width: 'auto',
        },
        '.input-action-addon .input-action-button': {
          width: '100% !important',
          height: '100% !important',
          display: 'flex !important',
          alignItems: 'center !important',
          justifyContent: 'center !important',
          padding: '0.5rem !important',
          minWidth: '2.5rem',
          margin: '0 !important',
          borderRadius: '0 !important',
        },
      };
      addUtilities(newUtilities, ['responsive', 'hover', 'focus']);
    },
  ],
};
