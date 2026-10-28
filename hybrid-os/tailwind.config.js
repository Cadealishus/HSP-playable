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
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
      },
      fontFamily: {
        // One family: Geist for all UI text and numerals, Geist Mono only for code and terminal.
        display: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'Consolas', 'monospace'],
        win: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Geist', 'system-ui', 'sans-serif'],
      },
    },
  },
};
