import { describe, expect, it } from 'vitest'
import {
  badgeLabel, classify, historyOpenByDefault, HISTORY_LIMIT, markClipped, nextHistoryCount, recentHistory, runningSubagentsOf, sameClassification, sameHistory,
  subagentElapsed, type SessionListLike, type SessionRow, type SessionStatusLike,
} from '../src/client/classify.ts'
import { formatDuration, formatTokens, wrapT } from '../src/client/locales.ts'

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

  it('keeps a Session running while its subagents run, matching the sidebar', () => {
    // 主会话本轮已结束（completionUnread），但子智能体还在运行：侧边栏显示进行中
    const rows = [row('p'), row('c', { origin: 'subagent', running: true })]
    const projections = { p: { values: { subagentCatalog: [{ id: 'c', mode: 'one-shot' }] } } }
    const s = new Map([['p', status({ running: false, completionUnread: true })]])
    const during = classify(list(rows, projections), s, undefined)
    expect(during.counts).toEqual({ pending: 0, completed: 0, running: 1 })
    expect(during.groups[0]?.sessions[0]).toMatchObject({ kind: 'running', runningSubagents: 1 })
    expect(recentHistory(list(rows, projections), s, undefined)).toEqual([])

    // 子智能体结束后，未查看的完成才显示为已完成
    const after = new Map([...s, ['c', status({ running: false })]])
    expect(classify(list(rows, projections), after, undefined).groups[0]?.sessions[0]).toMatchObject({ kind: 'completed', runningSubagents: 0 })

    // 自身运行中优先于未读完成，与侧边栏一致
    const self = new Map([['p', status({ running: true, completionUnread: true })]])
    expect(classify(list([row('p')]), self, undefined).groups[0]?.sessions[0]).toMatchObject({ kind: 'running', runningSubagents: 0 })

    // 待处理仍然最优先
    const ask = new Map([...s, ['p', status({ pendingInteraction: { kind: 'approval' } })]])
    expect(classify(list(rows, projections), ask, undefined).groups[0]?.kind).toBe('pending')
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

describe('runningSubagentsOf', () => {
  const usage = { uncachedInputTokens: 1000, outputTokens: 200, cacheReadTokens: 10_000, cacheWriteTokens: 300 }
  const l = list(
    [
      row('p', { running: true }),
      row('c1', { origin: 'subagent', running: true, displayTitle: 'fallback', projectionValues: { title: '查找调用方', subagentTiming: { settledMs: 5000, active: { since: 1000, through: 2000 } }, tokenUsage: usage } }),
      row('c2', { origin: 'subagent', running: true, displayTitle: 'c2-title' }),
      row('c3', { origin: 'subagent', running: false }),
      row('c4', { origin: 'subagent', running: true, projectionValues: { title: '同名' } }),
    ],
    { p: { values: { subagentCatalog: [
      { id: 'c1', mode: 'one-shot', label: '分析依赖' },
      { id: 'c2', mode: 'one-shot' },
      { id: 'c3', mode: 'continuable', label: '已结束' },
      { id: 'ext', mode: 'external', label: '外部' },
      { id: 'c4', mode: 'continuable', label: '同名' },
    ] } } },
  )

  it('lists only running, non-external children in catalog order with name, task, timing and tokens', () => {
    const subs = runningSubagentsOf(l, new Map(), 'p')
    expect(subs.map((x) => x.id)).toEqual(['c1', 'c2', 'c4'])
    expect(subs[0]).toEqual({ id: 'c1', name: '分析依赖', task: '查找调用方', settledMs: 5000, activeSince: 1000, tokens: 11_500 })
    // 没有标签时名称取子会话标题，且不再重复显示为任务
    expect(subs[1]).toEqual({ id: 'c2', name: 'c2-title' })
    // 任务与名称相同时省略
    expect(subs[2]).toEqual({ id: 'c4', name: '同名' })
  })

  it('prefers the live status over the list row', () => {
    const s = new Map([['c1', status({ running: false })], ['c3', status({ running: true })]])
    expect(runningSubagentsOf(l, s, 'p').map((x) => x.id)).toEqual(['c2', 'c3', 'c4'])
  })

  it('feeds classify and its structural comparison', () => {
    const session = classify(l, new Map(), undefined).groups[0]!.sessions[0]!
    expect(session.runningSubagents).toBe(3)
    expect(session.subagents).toHaveLength(3)
    const changed = list(
      [row('p', { running: true }), row('c1', { origin: 'subagent', running: true, projectionValues: { tokenUsage: usage } })],
      { p: { values: { subagentCatalog: [{ id: 'c1', label: 'a' }] } } },
    )
    const before = classify(changed, new Map(), undefined)
    const moreTokens = list(
      [row('p', { running: true }), row('c1', { origin: 'subagent', running: true, projectionValues: { tokenUsage: { ...usage, outputTokens: 999 } } })],
      { p: { values: { subagentCatalog: [{ id: 'c1', label: 'a' }] } } },
    )
    expect(sameClassification(before, classify(changed, new Map(), undefined))).toBe(true)
    expect(sameClassification(before, classify(moreTokens, new Map(), undefined))).toBe(false)
  })

  it('computes elapsed time from settled time plus the open turn', () => {
    expect(subagentElapsed({ id: 'a', name: 'a' }, 10_000)).toBeUndefined()
    expect(subagentElapsed({ id: 'a', name: 'a', settledMs: 3000 }, 10_000)).toBe(3000)
    expect(subagentElapsed({ id: 'a', name: 'a', settledMs: 3000, activeSince: 4000 }, 10_000)).toBe(9000)
    expect(subagentElapsed({ id: 'a', name: 'a', settledMs: 0, activeSince: 12_000 }, 10_000)).toBe(0)
  })
})

describe('markClipped', () => {
  it('appends an ellipsis to titles cut at the fallback limits', () => {
    // 真实数据：首条提示被截到 39 字节，DSH 不加省略号
    expect(markClipped('这是一个插件测试任务，请尽')).toBe('这是一个插件测试任务，请尽…')
    // 英文提示截到 5 个词
    expect(markClipped('please wait for ten minutes')).toBe('please wait for ten minutes…')
  })
  it('leaves short or already marked titles alone', () => {
    expect(markClipped('测试：等待 10 分钟')).toBe('测试：等待 10 分钟')
    expect(markClipped('查找所有调用方')).toBe('查找所有调用方')
    expect(markClipped('fix the login bug')).toBe('fix the login bug')
    expect(markClipped('已经截断…')).toBe('已经截断…')
  })
  it('also marks complete titles that happen to reach the limit (known false positive)', () => {
    // 37 字节：与「截到 40 字节以内」无法区分
    expect(markClipped('查找 classify.ts 的所有调用方')).toBe('查找 classify.ts 的所有调用方…')
  })
  it('is applied to subagent tasks', () => {
    const l = list(
      [row('p', { running: true }), row('c', { origin: 'subagent', running: true, projectionValues: { title: '这是一个插件测试任务，请尽' } })],
      { p: { values: { subagentCatalog: [{ id: 'c', mode: 'continuable', label: '测试：等待 3 分钟' }] } } },
    )
    expect(runningSubagentsOf(l, new Map(), 'p')[0]?.task).toBe('这是一个插件测试任务，请尽…')
  })
})

describe('subagent formatting', () => {
  const t = wrapT(undefined)
  it('formats durations', () => {
    expect(formatDuration(t, 42_400)).toBe('42 秒')
    expect(formatDuration(t, 125_000)).toBe('2 分 5 秒')
    expect(formatDuration(t, 3_725_000)).toBe('1 小时 2 分')
  })
  it('formats token counts like the DSH subagent menu', () => {
    expect(formatTokens(t, 999)).toBe('999 tok')
    expect(formatTokens(t, 12_345)).toBe('12.3K tok')
    expect(formatTokens(t, 123_456)).toBe('123K tok')
    expect(formatTokens(t, 1_250_000)).toBe('1.3M tok')
  })
})

describe('recentHistory', () => {
  it('lists only inactive Sessions, newest first, and never overlaps the active groups', () => {
    const l = list([
      row('idle-old', { updatedAt: 1 }),
      row('idle-new', { updatedAt: 9 }),
      row('run', { running: true, updatedAt: 20 }),
      row('done', { updatedAt: 30 }),
      row('ask', { updatedAt: 40 }),
    ])
    const s = new Map([
      ['done', status({ completionUnread: true })],
      ['ask', status({ pendingInteraction: { kind: 'question' } })],
    ])
    expect(recentHistory(l, s, undefined).map((x) => x.id)).toEqual(['idle-new', 'idle-old'])
    const active = classify(l, s, undefined).groups.flatMap((g) => g.sessions.map((x) => x.id))
    expect(active).toEqual(['ask', 'done', 'run'])
  })

  it('treats a Session whose live status stopped running as history', () => {
    const l = list([row('a', { running: true, updatedAt: 5 })])
    expect(recentHistory(l, new Map([['a', status({ running: false })]]), undefined).map((x) => x.id)).toEqual(['a'])
  })

  it('excludes subagent, blank and archived Sessions', () => {
    const l = list([row('sub', { origin: 'subagent' }), row('blank', { blank: true }), row('arch'), row('ok')])
    expect(recentHistory(l, new Map(), { items: [], archivedSessionIds: ['arch'] }).map((x) => x.id)).toEqual(['ok'])
  })

  it('caps the list at the history limit', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`s${i}`, { updatedAt: i }))
    const result = recentHistory(list(rows), new Map(), undefined)
    expect(result).toHaveLength(HISTORY_LIMIT)
    expect(result[0]?.id).toBe('s19')
    expect(recentHistory(list(rows), new Map(), undefined, 3).map((x) => x.id)).toEqual(['s19', 's18', 's17'])
  })

  it('names the Workspace and marks the current Session', () => {
    const l = list([row('a', { cwd: '/x/proj', retainedBy: { mainView: 1 } }), row('b')])
    const [a, b] = recentHistory(l, new Map(), { items: [{ title: 'WS', sessionIds: ['b'] }], archivedSessionIds: [] })
    expect(a).toMatchObject({ id: 'a', workspace: 'proj', current: true })
    expect(b).toMatchObject({ id: 'b', workspace: 'WS', current: false })
  })

  it('handles an absent list and compares structurally', () => {
    expect(recentHistory(undefined, undefined, undefined)).toEqual([])
    const l = list([row('a')])
    expect(sameHistory(recentHistory(l, new Map(), undefined), recentHistory(l, new Map(), undefined))).toBe(true)
    expect(sameHistory(recentHistory(l, new Map(), undefined), recentHistory(list([row('a', { updatedAt: 1 })]), new Map(), undefined))).toBe(false)
  })
})

describe('history paging', () => {
  it('opens by default only when nothing is active', () => {
    expect(historyOpenByDefault(0)).toBe(true)
    expect(historyOpenByDefault(2)).toBe(false)
  })

  it('adds five at a time up to the available count and the limit', () => {
    expect(nextHistoryCount(5, 15)).toBe(10)
    expect(nextHistoryCount(10, 15)).toBe(15)
    expect(nextHistoryCount(5, 7)).toBe(7)
    expect(nextHistoryCount(15, 40)).toBe(15)
  })
})

describe('badgeLabel', () => {
  it('caps at 99+', () => {
    expect(badgeLabel(7)).toBe('7')
    expect(badgeLabel(99)).toBe('99')
    expect(badgeLabel(100)).toBe('99+')
  })
})
