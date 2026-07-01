import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // === FOUNDATION — tema "Port Call Ledger" (interior tinta gelap) ===
        background: '#0A1C24', // Level 0 — kanvas tinta
        surface: '#081820',
        'surface-secondary': '#0E2731', // Level 1 — sidebar, cards
        'surface-tertiary': '#16333D', // Level 2 — hover, input active
        'surface-container': '#112430',
        'surface-container-high': '#1B3540',
        'card-bg': '#0B1F28',
        'card-border': '#14323D',
        'border-muted': '#1C4049',

        // === TEXT ===
        'text-primary': '#EDF1EE',
        'text-secondary': '#8FA6AB',
        'on-surface': '#DCE6E6',

        // === ACCENTS (brass = aksen utama; teal-laut = sekunder. Nama token
        //     dipertahankan agar ratusan konsumen kelas tak perlu diubah) ===
        'accent-blue': '#C79A3E', // brass
        'accent-teal': '#5AA0A8', // teal laut
        'accent-amber': '#D9A53E',
        'accent-purple': '#C79A3E', // ungu di-remap ke brass
        primary: '#D9B978', // brass terang
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: '#5AA0A8',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',

        // === STATUS ===
        'status-danger': '#C0432E',
        'status-warning': '#D98E2B',
        'status-success': '#3E8E6E',

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
