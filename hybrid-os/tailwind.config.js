/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        line: 'var(--line)',
        hover: 'var(--hover)',
        field: 'var(--field)',
        acc: 'rgb(var(--acc) / <alpha-value>)',
        acc2: 'rgb(var(--acc2) / <alpha-value>)',
        onacc: 'var(--on-acc)',
      },
      fontFamily: {
        display: ['Sora', 'Manrope', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
        win: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
};
