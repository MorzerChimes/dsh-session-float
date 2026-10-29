import { describe, expect, it } from 'vitest'
import {
  anchorStyle, clampPosition, clampRect, cornerFor, panelBudget, positionFromRect, rectFromPosition, transformOrigin,
} from '../src/client/placement.ts'
import { DEFAULT_PREFS, STORAGE_KEY, createPrefsStore, parsePrefs, type StorageLike } from '../src/client/prefs.ts'
import { createSchemeSource, resolveScheme } from '../src/client/theme.ts'

const VIEW = { width: 1280, height: 800 }

describe('placement', () => {
  it('picks the corner by viewport half', () => {
    expect(cornerFor({ left: 10, top: 10, width: 100, height: 36 }, VIEW)).toBe('tl')
    expect(cornerFor({ left: 1100, top: 10, width: 100, height: 36 }, VIEW)).toBe('tr')
    expect(cornerFor({ left: 10, top: 700, width: 100, height: 36 }, VIEW)).toBe('bl')
    expect(cornerFor({ left: 1100, top: 700, width: 100, height: 36 }, VIEW)).toBe('br')
  })

  it('round-trips rect ↔ position without moving the element', () => {
    const rect = { left: 1000, top: 600, width: 200, height: 36 }
    const pos = positionFromRect(rect, VIEW)
    expect(pos).toEqual({ corner: 'br', dx: 80, dy: 164 })
    expect(rectFromPosition(pos, rect, VIEW)).toEqual(rect)
  })

  it('clamps into the viewport with an 8px margin', () => {
    expect(clampRect({ left: -50, top: 900, width: 200, height: 36 }, VIEW)).toEqual({ left: 8, top: 756, width: 200, height: 36 })
    expect(positionFromRect({ left: 2000, top: -20, width: 200, height: 36 }, VIEW)).toEqual({ corner: 'tr', dx: 8, dy: 8 })
  })

  it('keeps stored offsets valid when the viewport shrinks', () => {
    const pos = { corner: 'tr' as const, dx: 1200, dy: 4 }
    expect(clampPosition(pos, { width: 200, height: 36 }, VIEW)).toEqual({ corner: 'tr', dx: 1072, dy: 8 })
    const ok = { corner: 'tl' as const, dx: 16, dy: 12 }
    expect(clampPosition(ok, { width: 200, height: 36 }, VIEW)).toBe(ok)
  })

  it('anchors CSS to the corner and grows away from it', () => {
    expect(anchorStyle({ corner: 'tr', dx: 20, dy: 12 })).toEqual({ left: 'auto', right: 20, top: 12, bottom: 'auto' })
    expect(anchorStyle({ corner: 'bl', dx: 16, dy: 30 })).toEqual({ left: 16, right: 'auto', top: 'auto', bottom: 30 })
    expect(transformOrigin('br')).toBe('bottom right')
    expect(panelBudget({ corner: 'tl', dx: 16, dy: 12 }, VIEW)).toEqual({ width: 1256, height: 780 })
  })
})

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
}

describe('prefs', () => {
  it('falls back field by field on bad data', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    const parsed = parsePrefs(JSON.stringify({ appearance: 'dark', collapsedStyle: 'weird', position: { corner: 'br', dx: -3, dy: 40 } }))
    expect(parsed.appearance).toBe('dark')
    expect(parsed.collapsedStyle).toBe('detailed')
    expect(parsed.collapseOnOutsideClick).toBe(true)
    expect(parsed.position).toEqual({ corner: 'br', dx: 16, dy: 40 })
  })

  it('persists updates, notifies once per real change, and resets', () => {
    const storage = memoryStorage()
    const store = createPrefsStore(storage)
    let calls = 0
    store.subscribe(() => { calls += 1 })
    store.update({ collapsedStyle: 'compact' })
    store.update({ collapsedStyle: 'compact' })
    expect(calls).toBe(1)
    expect(JSON.parse(storage.data[STORAGE_KEY]!).collapsedStyle).toBe('compact')
    expect(createPrefsStore(storage).getSnapshot().collapsedStyle).toBe('compact')
    store.reset()
    expect(store.getSnapshot()).toEqual(DEFAULT_PREFS)
  })
})

describe('scheme', () => {
  it('resolves explicit choices and follows DSH for system', () => {
    expect(resolveScheme('light', 'dark')).toBe('light')
    expect(resolveScheme('system', 'dark')).toBe('dark')
    const store = createPrefsStore(memoryStorage())
    let dsh: 'light' | 'dark' = 'light'
    let fire = () => {}
    const scheme = createSchemeSource(store, () => dsh, (fn) => { fire = fn; return () => {} })
    expect(scheme.getSnapshot()).toBe('light')
    dsh = 'dark'
    fire()
    expect(scheme.getSnapshot()).toBe('dark')
    store.update({ appearance: 'light' })
    expect(scheme.getSnapshot()).toBe('light')
  })
})
