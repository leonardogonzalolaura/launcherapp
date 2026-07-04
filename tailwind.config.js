/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          base: '#0d0d14',
          surface: '#13131f',
          elevated: '#1a1a2e',
          hover: '#1f1f35',
          selected: '#1e2a45',
        },
        border: {
          DEFAULT: '#252540',
          light: '#2e2e50',
        },
        text: {
          primary: '#e2e4f0',
          secondary: '#8890b0',
          muted: '#555878',
        },
        accent: {
          DEFAULT: '#6e7fff',
          dim: '#3a4199',
        },
        green: {
          DEFAULT: '#3dd68c',
        },
        red: {
          DEFAULT: '#f87171',
        },
        yellow: {
          DEFAULT: '#fbbf24',
        },

      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      boxShadow: {
        sm: '0 1px 4px rgba(0,0,0,.4)',
        md: '0 4px 16px rgba(0,0,0,.5)',
        lg: '0 8px 32px rgba(0,0,0,.6)',
      },
    },
  },
  plugins: [],
}