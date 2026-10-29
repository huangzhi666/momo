'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = window.localStorage.getItem('lexiloop-theme') as Theme | null
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      setResolved(dark ? 'dark' : 'light')
    }
    apply()
    window.localStorage.setItem('lexiloop-theme', theme)
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved,
      setTheme: setThemeState,
      toggle: () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [theme, resolved],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    return {
      theme: 'system',
      resolved: 'light',
      setTheme: () => undefined,
      toggle: () => undefined,
    }
  }
  return context
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipPrimitive.Provider delayDuration={250}>
          {children}
          <Toaster
            position="top-center"
            closeButton
            toastOptions={{
              style: {
                background: 'var(--popover)',
                color: 'var(--popover-foreground)',
                border: '1px solid var(--border)',
              },
            }}
          />
        </TooltipPrimitive.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
