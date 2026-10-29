/**
 * Island preferences: one validated snapshot persisted per browser in
 * localStorage and shared by the island, its in-island settings page, and
 * the Plugins-page configuration area.
 */
import { DEFAULT_POSITION, isCorner, samePosition, type Position } from './placement.ts'

export type Appearance = 'light' | 'dark' | 'system'
export type CollapsedStyle = 'compact' | 'detailed'

export interface Prefs {
  readonly version: 1
  readonly appearance: Appearance
  readonly collapsedStyle: CollapsedStyle
  readonly collapseOnOutsideClick: boolean
  /** 只在会话页显示；插件、自动化任务等全局页面中隐藏。 */
  readonly onlyInConversation: boolean
  readonly position: Position
}

export const DEFAULT_PREFS: Prefs = {
  version: 1,
  appearance: 'system',
  collapsedStyle: 'detailed',
  collapseOnOutsideClick: true,
  onlyInConversation: false,
  position: DEFAULT_POSITION,
}

/**
 * 灵动岛在当前主面板中是否可见。
 * @param activePanelId - ui-layout 的 `panelInfo.activePanelId`；null 表示会话页，undefined 表示拿不到（按会话页处理）。
 */
export function isIslandVisible(prefs: Pick<Prefs, 'onlyInConversation'>, activePanelId: string | null | undefined): boolean {
  return !prefs.onlyInConversation || activePanelId == null
}

export const STORAGE_KEY = 'dsh-session-float:prefs'

/** Minimal Web Storage surface, injectable for tests. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function finiteOffset(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 100_000 ? Math.round(value) : fallback
}

/** Parse untrusted stored JSON field by field; invalid fields fall back to defaults. */
export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PREFS
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_PREFS
  const v = data as Record<string, unknown>
  const pos = (typeof v.position === 'object' && v.position !== null ? v.position : {}) as Record<string, unknown>
  return {
    version: 1,
    appearance: v.appearance === 'light' || v.appearance === 'dark' || v.appearance === 'system' ? v.appearance : DEFAULT_PREFS.appearance,
    collapsedStyle: v.collapsedStyle === 'compact' || v.collapsedStyle === 'detailed' ? v.collapsedStyle : DEFAULT_PREFS.collapsedStyle,
    collapseOnOutsideClick: typeof v.collapseOnOutsideClick === 'boolean' ? v.collapseOnOutsideClick : DEFAULT_PREFS.collapseOnOutsideClick,
    onlyInConversation: typeof v.onlyInConversation === 'boolean' ? v.onlyInConversation : DEFAULT_PREFS.onlyInConversation,
    position: {
      corner: isCorner(pos.corner) ? pos.corner : DEFAULT_POSITION.corner,
      dx: finiteOffset(pos.dx, DEFAULT_POSITION.dx),
      dy: finiteOffset(pos.dy, DEFAULT_POSITION.dy),
    },
  }
}

function samePrefs(a: Prefs, b: Prefs): boolean {
  return a.appearance === b.appearance && a.collapsedStyle === b.collapsedStyle
    && a.collapseOnOutsideClick === b.collapseOnOutsideClick && a.onlyInConversation === b.onlyInConversation
    && samePosition(a.position, b.position)
}

export interface PrefsStore {
  getSnapshot(): Prefs
  subscribe(listener: () => void): () => void
  update(patch: Partial<Omit<Prefs, 'version'>>): void
  reset(): void
  dispose(): void
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * Create the shared store. Cross-tab changes arrive through the `storage`
 * event; a failed write keeps the in-memory value so the UI stays responsive.
 */
export function createPrefsStore(storage: StorageLike | undefined = browserStorage()): PrefsStore {
  let read: string | null = null
  try {
    read = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    read = null
  }
  let snapshot = parsePrefs(read)
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const fn of [...listeners]) fn()
  }
  const commit = (next: Prefs) => {
    if (samePrefs(next, snapshot)) return
    snapshot = next
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.warn('[dsh-session-float] failed to persist preferences:', error)
    }
    emit()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    const next = parsePrefs(event.newValue)
    if (samePrefs(next, snapshot)) return
    snapshot = next
    emit()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update(patch) {
      commit({ ...snapshot, ...patch, version: 1 })
    },
    reset() {
      commit(DEFAULT_PREFS)
    },
    dispose() {
      listeners.clear()
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    },
  }
}
