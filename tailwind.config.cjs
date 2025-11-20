/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8a4dff',
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
        },
        accent: {
          DEFAULT: '#25d3d1',
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
      },
      backgroundImage: {
        'luna-gradient':
          'radial-gradient(900px circle at 75% -10%, rgba(138,77,255,0.35), transparent 60%), radial-gradient(720px circle at 12% 115%, rgba(37,211,209,0.22), transparent 45%)',
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
          backgroundColor: 'rgba(10, 13, 34, 0.82)',
          border: '1px solid rgba(138, 77, 255, 0.18)',
          borderRadius: '16px',
          boxShadow: '0 35px 80px rgba(5, 8, 24, 0.75)',
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
          backgroundColor: 'rgba(138, 77, 255, 0.22)',
          borderColor: 'rgba(138, 77, 255, 0.6)',
          boxShadow: '0 15px 40px rgba(138, 77, 255, 0.35)',
        },
      };
      addUtilities(newUtilities, ['responsive', 'hover', 'focus']);
    },
  ],
};
