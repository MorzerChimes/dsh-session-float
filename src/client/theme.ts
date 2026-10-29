/**
 * Resolve the island's color scheme: an explicit light/dark preference wins;
 * `system` follows DSH's resolved theme (which already resolves its own
 * `system` through prefers-color-scheme).
 */
import type { Appearance, PrefsStore } from './prefs.ts'

export type Scheme = 'light' | 'dark'

export interface ObservableValue<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Minimal slice of `ctx.theme` (dsh-client-ui-theme ThemeRuntime). */
export interface ThemeLike {
  getTheme(): { readonly active: { readonly colorScheme: 'light' | 'dark' } }
}

export function resolveScheme(appearance: Appearance, dshScheme: Scheme): Scheme {
  return appearance === 'system' ? dshScheme : appearance
}

/** Best-effort read of DSH's presented scheme when the theme service is absent. */
export function documentScheme(): Scheme {
  if (typeof document !== 'undefined' && document.body?.hasAttribute('data-ds-dark-theme')) return 'dark'
  return 'light'
}

/**
 * Combine the preference store with DSH's theme into one observable scheme.
 * @param prefs - island preference store.
 * @param readDsh - reads DSH's current color scheme.
 * @param onDshChange - subscribes to DSH theme changes; returns a disposer.
 */
export function createSchemeSource(
  prefs: PrefsStore,
  readDsh: () => Scheme,
  onDshChange: (listener: () => void) => () => void,
): ObservableValue<Scheme> & { dispose(): void } {
  let dsh = readDsh()
  let value = resolveScheme(prefs.getSnapshot().appearance, dsh)
  const listeners = new Set<() => void>()
  const recompute = () => {
    const next = resolveScheme(prefs.getSnapshot().appearance, dsh)
    if (next === value) return
    value = next
    for (const fn of [...listeners]) fn()
  }
  const offPrefs = prefs.subscribe(recompute)
  const offDsh = onDshChange(() => {
    dsh = readDsh()
    recompute()
  })
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      offPrefs()
      offDsh()
      listeners.clear()
    },
  }
}
