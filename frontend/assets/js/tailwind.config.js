/**
 * Tailwind (play CDN) theme + shared component classes.
 * Palette is inspired by public signage: ink navy, municipal green, signal yellow.
 * Load this file right AFTER the Tailwind CDN script on every page.
 */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: '#173D30',
        civic: { DEFAULT: '#1F6F5C', dark: '#17574A', light: '#E3F1EC' },
        signal: '#F2C14E',
        paper: '#F5F7F6',
        muted: '#4A5568',
        danger: '#B42318'
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: [
    function ({ addComponents }) {
      addComponents({
        '.btn': { '@apply inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed': {} },
        '.btn-primary': { '@apply bg-civic text-white hover:bg-civic-dark': {} },
        '.btn-secondary': { '@apply bg-white text-ink border border-ink/20 hover:bg-paper': {} },
        '.btn-danger': { '@apply bg-white text-danger border border-danger/40 hover:bg-red-50': {} },
        '.input': { '@apply block w-full rounded-md border border-ink/25 bg-white px-3 py-2 text-ink placeholder:text-muted/70 focus:border-civic focus:outline-none focus:ring-2 focus:ring-civic/30': {} },
        '.label': { '@apply block text-sm font-semibold text-ink mb-1': {} },
        '.field-error': { '@apply mt-1 text-sm text-danger': {} },
        '.card': { '@apply bg-white border border-ink/10 rounded-lg': {} },
        '.badge': { '@apply inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold': {} },
        '.nav-link': { '@apply px-3 py-2 text-sm font-semibold text-white/80 hover:text-white border-b-2 border-transparent': {} },
        '.nav-link.is-active': { '@apply text-white border-signal': {} }
      });
    }
  ]
};
