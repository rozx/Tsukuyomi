/**** Tailwind CSS Config for Quasar + Vite ****/
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Luna palette
        luna: {
          50: '#fef2f7',
          100: '#fce7f0',
          200: '#f9cfe1',
          300: '#f4a7c8',
          400: '#ed6ba8',
          500: '#f0458b', // primary
          600: '#d91d7a',
          700: '#b81666',
          800: '#961455',
          900: '#7a1145',
          950: '#4d0a2b',
        },
        night: {
          DEFAULT: '#0b1026',
          900: '#0b1026',
          950: '#070a1a',
        },
        moon: {
          DEFAULT: '#f6f3d1', // soft moonlight
          400: '#f1e3a8',
          500: '#f6f3d1',
        },
        // Convenience alias for Tailwind usage
        primary: {
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
          'radial-gradient(1200px circle at 80% -10%, rgba(240,69,139,0.35), transparent 60%), radial-gradient(800px circle at 10% 110%, rgba(241,227,168,0.12), transparent 40%)',
      },
    },
  },
  plugins: [
    function ({ addUtilities, theme }) {
      const newUtilities = {
        '.bg-luna-stars': {
          backgroundColor: theme('colors.night.DEFAULT'),
          backgroundImage:
            'radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.8) 50%, transparent 51%), radial-gradient(1px 1px at 80px 120px, rgba(255,255,255,0.7) 50%, transparent 51%), radial-gradient(1px 1px at 200px 80px, rgba(255,255,255,0.6) 50%, transparent 51%), radial-gradient(1px 1px at 320px 200px, rgba(255,255,255,0.8) 50%, transparent 51%)',
          backgroundSize: '200px 200px',
          backgroundRepeat: 'repeat',
        },
        '.bg-luna-sky': {
          backgroundImage: 'linear-gradient(180deg, #0b1026 0%, #4d0a2b 35%, #7a1145 100%)',
        },
        // 统一的卡片样式
        '.card-base': {
          backgroundColor: 'rgba(11, 16, 38, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
        },
        '.card-header': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '1rem 1.25rem',
        },
        '.card-content': {
          backgroundColor: 'rgba(14, 21, 53, 0.95)',
          padding: '1.5rem',
        },
        '.card-footer': {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '1rem 1.5rem',
        },
        // 统一的输入组样式
        '.input-group-base': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
        },
        // 统一的列表项样式
        '.list-item-base': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        '.list-item-hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
        },
        '.list-item-selected': {
          backgroundColor: 'rgba(240, 69, 139, 0.2)',
          borderColor: 'rgba(240, 69, 139, 0.5)',
          boxShadow: '0 2px 8px rgba(240, 69, 139, 0.2)',
        },
      };
      addUtilities(newUtilities, ['responsive', 'hover', 'focus']);
    },
  ],
};
