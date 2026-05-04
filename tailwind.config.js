// tailwind.config.js
const { heroui } = require("@heroui/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./node_modules/@heroui/theme/dist/components/(table|checkbox|form|spacer).js",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  safelist: [
    'bg-primary', 'text-white' // add any classes used dynamically
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          600: '#dc2d27', // so `bg-primary` works
        },
      },
      borderRadius: {
        'xl': '1rem'
      }
    },
  },
  darkMode: "class",
  plugins: [heroui()],
};