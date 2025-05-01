/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#1E1E1E',
        'secondary': '#2D2D2D',
        'accent': '#3B82F6',
        'success': '#10B981',
        'danger': '#EF4444',
        'warning': '#F59E0B',
        'text-primary': '#F3F4F6',
        'text-secondary': '#9CA3AF',
      },
      spacing: {
        '8': '8px',
        '16': '16px',
        '24': '24px',
        '32': '32px',
        '40': '40px',
        '48': '48px',
      },
    },
  },
  plugins: [],
} 