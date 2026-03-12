import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        ember: {
          50: '#fff4eb',
          100: '#ffe4cf',
          200: '#ffc698',
          300: '#ffa35f',
          400: '#ff7f2f',
          500: '#f46313',
          600: '#d44b09',
          700: '#ac350a',
          800: '#8b2c10',
          900: '#722710'
        }
      },
      boxShadow: {
        ember: '0 0 40px rgba(245, 99, 19, 0.35)'
      }
    }
  },
  plugins: []
}

export default config
