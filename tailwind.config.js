/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        sage: {
          50: '#f3f5f0',
          100: '#e4e9dd',
          200: '#c8d4ba',
          300: '#a8ba92',
          400: '#87a069',
          500: '#6a8a4e',
          600: '#527039',
          700: '#3f5829',
          800: '#2d3f1e',
          900: '#1a2512',
        },
        forest: {
          DEFAULT: '#1a2e20',
          light: '#243d2a',
          dark: '#111e15',
        },
        lime: {
          active: '#c9e87a',
        },
        coral: {
          DEFAULT: '#f0634a',
          light: '#fde8e4',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
