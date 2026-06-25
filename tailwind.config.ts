import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // === FOUNDATION (dari DESIGN.md Stitch) ===
        background: '#0A1628', // Level 0 — canvas utama
        surface: '#071325',
        'surface-secondary': '#0F1F3D', // Level 1 — sidebar, cards
        'surface-tertiary': '#162844', // Level 2 — hover, input active
        'surface-container': '#142032',
        'surface-container-high': '#1F2A3D',
        'card-bg': '#09162A',
        'card-border': '#0E2240',
        'border-muted': '#1E3A5F',

        // === TEXT ===
        'text-primary': '#F0F4FF',
        'text-secondary': '#8BA4C0',
        'on-surface': '#D7E3FC',

        // === ACCENTS ===
        'accent-blue': '#3B9EFF',
        'accent-teal': '#1DD4A8',
        'accent-amber': '#E8A020',
        'accent-purple': '#9B6FFF',
        primary: '#A3C9FF',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: '#52DCC1',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',

        // === STATUS ===
        'status-danger': '#E74C3C',
        'status-warning': '#F39C12',
        'status-success': '#2ECC71',

        // shadcn/ui compatibility
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        foreground: 'hsl(var(--foreground))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'], // DM Serif Display
        body: ['var(--font-body)', 'sans-serif'], // Inter
        mono: ['var(--font-mono)', 'monospace'], // JetBrains Mono
      },
      fontSize: {
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
        'label-sm': ['10px', { lineHeight: '14px', letterSpacing: '0.05em', fontWeight: '500' }],
      },
      borderRadius: {
        sm: '0.125rem', // 2px
        DEFAULT: '0.25rem', // 4px — komponen kecil
        md: '0.375rem', // 6px
        lg: '0.5rem', // 8px — cards
        xl: '0.75rem', // 12px — modal
        full: '9999px', // pill
      },
      spacing: {
        gutter: '16px',
        'margin-page': '24px',
        'container-max': '1600px',
        'row-standard': '48px',
        'row-dense': '32px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
