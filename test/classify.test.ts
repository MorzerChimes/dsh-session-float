import { describe, expect, it } from 'vitest'
import { badgeLabel, classify, sameClassification, type SessionListLike, type SessionRow, type SessionStatusLike } from '../src/client/classify.ts'

function row(id: string, extra: Partial<SessionRow> = {}): SessionRow {
  return { id, displayTitle: `title-${id}`, blank: false, running: false, updatedAt: 0, ...extra }
}

function list(rows: SessionRow[], projections: SessionListLike['projectionsBySession'] = {}): SessionListLike {
  return { ids: rows.map((r) => r.id), byId: Object.fromEntries(rows.map((r) => [r.id, r])), projectionsBySession: projections }
}

function status(extra: Partial<SessionStatusLike> = {}): SessionStatusLike {
  return { running: undefined, pendingInteraction: undefined, completionUnread: false, ...extra }
}

describe('classify', () => {
  it('orders groups pending → completed → running and drops empty groups', () => {
    const l = list([row('r', { running: true }), row('c'), row('p')])
    const s = new Map([
      ['c', status({ completionUnread: true })],
      ['p', status({ pendingInteraction: { kind: 'approval' }, running: true })],
    ])
    const result = classify(l, s, undefined)
    expect(result.groups.map((g) => g.kind)).toEqual(['pending', 'completed', 'running'])
    expect(result.total).toBe(3)
    expect(result.counts).toEqual({ pending: 1, completed: 1, running: 1 })

    const noPending = classify(list([row('r', { running: true })]), new Map(), undefined)
    expect(noPending.groups.map((g) => g.kind)).toEqual(['running'])
    expect(noPending.counts.pending).toBe(0)
  })

  it('gives each Session exactly one status with pending taking precedence', () => {
    const l = list([row('a', { running: true })])
    const s = new Map([['a', status({ running: true, completionUnread: true, pendingInteraction: { kind: 'question' } })]])
    const result = classify(l, s, undefined)
    expect(result.total).toBe(1)
    expect(result.groups[0]?.sessions[0]?.pendingKind).toBe('question')
  })

  it('prefers the live status running flag over the list fallback', () => {
    const l = list([row('a', { running: true }), row('b', { running: false })])
    const s = new Map([['a', status({ running: false })], ['b', status({ running: true })]])
    expect(classify(l, s, undefined).groups[0]?.sessions.map((x) => x.id)).toEqual(['b'])
  })

  it('excludes subagent, blank and archived Sessions', () => {
    const l = list([
      row('sub', { running: true, origin: 'subagent' }),
      row('blank', { running: true, blank: true }),
      row('arch', { running: true }),
      row('ok', { running: true }),
    ])
    const result = classify(l, new Map(), { items: [], archivedSessionIds: ['arch'] })
    expect(result.groups[0]?.sessions.map((x) => x.id)).toEqual(['ok'])
  })

  it('sorts by updatedAt descending inside a group', () => {
    const l = list([row('old', { running: true, updatedAt: 1 }), row('new', { running: true, updatedAt: 5 })])
    expect(classify(l, new Map(), undefined).groups[0]?.sessions.map((x) => x.id)).toEqual(['new', 'old'])
  })

  it('names the Workspace, falls back to the cwd basename, counts running subagents and marks the current Session', () => {
    const l = list(
      [
        row('a', { running: true, cwd: '/home/u/proj', retainedBy: { mainView: 1 } }),
        row('b', { running: true, cwd: 'C:\\work\\api\\' }),
        row('child1', { running: true, origin: 'subagent' }),
        row('child2', { origin: 'subagent' }),
      ],
      { a: { values: { subagentCatalog: [{ id: 'child1' }, { id: 'child2' }] } } },
    )
    const result = classify(l, new Map(), { items: [{ title: 'My WS', sessionIds: ['a'] }], archivedSessionIds: [] })
    const [first, second] = result.groups[0]!.sessions
    expect(first?.workspace).toBe('My WS')
    expect(first?.runningSubagents).toBe(1)
    expect(first?.current).toBe(true)
    expect(second?.workspace).toBe('api')
    expect(second?.current).toBe(false)
  })

  it('handles an absent list', () => {
    expect(classify(undefined, undefined, undefined).total).toBe(0)
  })

  it('compares structurally', () => {
    const l = list([row('a', { running: true })])
    expect(sameClassification(classify(l, new Map(), undefined), classify(l, new Map(), undefined))).toBe(true)
    const l2 = list([row('a', { running: true, displayTitle: 'renamed' })])
    expect(sameClassification(classify(l, new Map(), undefined), classify(l2, new Map(), undefined))).toBe(false)
  })
})

describe('badgeLabel', () => {
  it('caps at 99+', () => {
    expect(badgeLabel(7)).toBe('7')
    expect(badgeLabel(99)).toBe('99')
    expect(badgeLabel(100)).toBe('99+')
  })
})
