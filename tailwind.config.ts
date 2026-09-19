import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f8fa',
          100: '#eceef3',
          200: '#d6dae3',
          400: '#8a91a3',
          500: '#646b7d',
          700: '#363b48',
          800: '#22252e',
          900: '#13151b',
        },
        accent: {
          info: '#5b8def',
          warn: '#e7a23b',
          mute: '#9ca3af',
          alert: '#d65a5a',
          ok: '#5fb78a',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular'],
      },
    },
  },
  plugins: [],
};

export default config;
