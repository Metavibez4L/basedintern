/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'pulse-medium': 'pulse-medium 1.5s ease-in-out infinite',
        'pulse-fast': 'pulse-fast 1s ease-in-out infinite',
        'pulse-intense': 'pulse-intense 0.8s ease-in-out infinite',
        'shake': 'shake 0.5s ease-in-out 3',
      },
    },
  },
  plugins: [],
}
