/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#eceff1', // Soft gray
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
        },
        accent: {
          DEFAULT: '#b39ddb',
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
        },
        accentTeal: {
          DEFAULT: '#80deea',
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
          DEFAULT: '#b39ddb', // Lavender - main icon color
          teal: '#80deea', // Icy teal - secondary icon color
          accent: '#b39ddb', // Alias for lavender
        },
        night: {
          50: '#f6f6ff',
          100: '#e7e9ff',
          200: '#cbcfff',
          300: '#adb3ff',
          400: '#8f96f5',
          500: '#6d73d3',
          600: '#5156a7',
          700: '#3a3e7b',
          800: '#242754',
          900: '#0f1430',
          950: '#050818',
        },
        moon: {
          50: '#fdfdff',
          100: '#f5f3ff',
          200: '#e8e5ff',
          300: '#d5d1ff',
          400: '#c0b7fb',
          500: '#a8a0e6',
          600: '#8b82c4',
          700: '#6d62a1',
          800: '#4f4577',
          900: '#322c4f',
        },
        luna: {
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
      },
      backgroundImage: {
        'luna-gradient':
          'radial-gradient(900px circle at 75% -10%, rgba(179,157,219,0.25), transparent 60%), radial-gradient(720px circle at 12% 115%, rgba(128,222,234,0.2), transparent 45%)',
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
        '.bg-luna-sky': {
          backgroundImage: 'linear-gradient(135deg, #050818 0%, #11163b 45%, #1f1f52 100%)',
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
          backgroundColor: 'rgba(236, 239, 241, 0.05)',
        },
        '.bg-surface-light': {
          backgroundColor: 'rgba(236, 239, 241, 0.1)',
        },
        '.bg-surface-medium': {
          backgroundColor: 'rgba(236, 239, 241, 0.15)',
        },
        '.bg-surface-strong': {
          backgroundColor: 'rgba(236, 239, 241, 0.2)',
        },
        '.bg-surface-card': {
          backgroundColor: 'rgba(253, 253, 255, 0.8)', // Pearl white with transparency
        },
        '.border-surface-subtle': {
          borderColor: 'rgba(236, 239, 241, 0.2)',
        },
        '.border-surface-light': {
          borderColor: 'rgba(236, 239, 241, 0.3)',
        },
        '.border-surface-medium': {
          borderColor: 'rgba(236, 239, 241, 0.4)',
        },
        '.border-surface-strong': {
          borderColor: 'rgba(236, 239, 241, 0.5)',
        },
        // Icon colors - use accent (Lavender) for icons instead of primary (Soft gray)
        '.text-icon': {
          color: '#b39ddb', // Lavender for icons
        },
        '.text-icon-teal': {
          color: '#80deea', // Icy teal for secondary icons
        },
        // Luna theme colors
        '.text-luna': {
          color: '#f0458b', // Luna primary color
        },
        '.bg-luna': {
          backgroundColor: '#f0458b', // Luna primary color
        },
        '.border-luna': {
          borderColor: '#f0458b', // Luna primary color
        },
        // Translation text color (distinct from original text)
        '.text-translation': {
          color: 'rgba(240, 69, 139, 0.9)', // Luna pink with 90% opacity for translations
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
