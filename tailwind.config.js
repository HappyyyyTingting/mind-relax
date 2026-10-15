/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': '#f1f6f0',
        'app-card': '#f8fcf5',
        'app-text': '#36403a',
        'app-muted': '#8fa095',
        'app-primary': '#b3d7ab',
        'app-primary-soft': '#b3d7abb3',
        'app-primary-hover': '#9ac090',
        'app-primary-disabled': '#e3f2dd',
        'app-input-border': '#d8e3d4',
        'app-input-bg': '#fcfdf9',
        'app-danger-border': '#c6a8a8',
        'app-danger-hover': '#f7efef',
        'app-accent': '#46723f',
      },
      boxShadow: {
        card: '0 1px 2px rgba(54, 64, 58, 0.04), 0 4px 14px rgba(54, 64, 58, 0.05)',
      },
    },
  },
  plugins: [],
};
