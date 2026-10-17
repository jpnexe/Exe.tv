/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      keyframes: {
        equalizer1: {
          '0%, 100%': { height: '25%' },
          '50%': { height: '100%' },
        },
        equalizer2: {
          '0%, 100%': { height: '90%' },
          '33%': { height: '30%' },
          '66%': { height: '75%' },
        },
        equalizer3: {
          '0%, 100%': { height: '45%' },
          '40%': { height: '100%' },
          '80%': { height: '20%' },
        },
      },
      animation: {
        eq1: 'equalizer1 0.8s ease-in-out infinite',
        eq2: 'equalizer2 0.7s ease-in-out infinite',
        eq3: 'equalizer3 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

