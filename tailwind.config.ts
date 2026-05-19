import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hermes: {
          orange: '#E8632A',
          dark: '#1A1A1A',
          cream: '#F5F0E8',
          gold: '#C9A84C',
        },
      },
    },
  },
  plugins: [],
};

export default config;
