/**
 * Browser half of dsh-session-float. Registers the island in `shell.overlay`
 * and the same settings form in the Plugins page (`plugins.bundle.config`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { useMemo } from 'react'
import { Island, type IslandProps } from './Island.tsx'
import { SettingsForm } from './SettingsForm.tsx'
import { createPrefsStore } from './prefs.ts'
import { createSchemeSource, documentScheme, type Scheme, type ThemeLike } from './theme.ts'
import { NS, en, wrapT, zh } from './locales.ts'
import css from './island.module.css'

/** Package name: the Plugins-page keyed slot is addressed by it. */
export const PACKAGE_NAME = 'dsh-session-float'

/** Required services. Navigation and theme are read lazily via ctx.get. */
export const inject = ['slots', 'locale']

interface SlotsLike {
  inject(name: string, register: () => (() => void) | Generator<() => void, void, unknown>): void
  register(options: Record<string, unknown>, component: (props: never) => unknown): () => void
}

interface LocaleLike {
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

interface UiWorkspaceLike {
  openSession(target: string): void
}

function BundleSettings(props: { view?: 'summary' | 'page'; t?: IslandProps['t']; prefs: ReturnType<typeof createPrefsStore> }) {
  const t = useMemo(() => wrapT(props.t), [props.t])
  if (props.view === 'summary') return null
  return (
    <div className={css.pageHost}>
      <SettingsForm prefs={props.prefs} t={t} variant="page" />
    </div>
  )
}

export function apply(ctx: Context) {
  const slots = (ctx as unknown as { slots: SlotsLike }).slots
  const locale = (ctx as unknown as { locale: LocaleLike }).locale
  const get = <T,>(name: string): T | undefined => (ctx as unknown as { get(name: string): T | undefined }).get(name)

  const prefs = createPrefsStore()
  ctx.effect(() => () => prefs.dispose(), 'session-float: prefs')

  const readDsh = (): Scheme => get<ThemeLike>('theme')?.getTheme().active.colorScheme ?? documentScheme()
  const scheme = createSchemeSource(prefs, readDsh, (listener) => {
    const off = (ctx as unknown as { on(name: string, fn: () => void): () => void }).on('theme/change', listener)
    // Fallback when ui-theme is absent: observe the presenter's body attribute.
    let observer: MutationObserver | undefined
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
      observer = new MutationObserver(listener)
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    }
    return () => {
      off()
      observer?.disconnect()
    }
  })
  ctx.effect(() => () => scheme.dispose(), 'session-float: scheme')

  ctx.effect(() => {
    const offZh = locale.register(NS, 'zh', zh)
    const offEn = locale.register(NS, 'en', en)
    return () => {
      offZh()
      offEn()
    }
  }, 'session-float: dictionaries')

  const openSession = (id: string) => {
    const nav = get<UiWorkspaceLike>('uiWorkspace')
    if (nav === undefined) {
      console.warn('[dsh-session-float] uiWorkspace is unavailable; cannot open session', id)
      return
    }
    nav.openSession(id)
  }

  slots.inject('shell.overlay', () => slots.register({
    name: 'shell.overlay',
    id: 'session-float.island',
    locale: NS,
    inject: () => ({ openSession, prefs, scheme }),
  }, Island as never))

  slots.inject('plugins.bundle.config', () => slots.register({
    name: 'plugins.bundle.config',
    key: PACKAGE_NAME,
    locale: NS,
    inject: () => ({ prefs }),
  }, BundleSettings as never))
}
