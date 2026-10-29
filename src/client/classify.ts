/**
 * Session classification for the island: pure functions over the Session
 * Controller list, the unified status map, and the Workspace snapshot.
 * The rules mirror ui-workspace's row status so both surfaces agree.
 */

export type StatusKind = 'pending' | 'completed' | 'running'

/** Fixed group order: pending first, completed second, running third. */
export const STATUS_ORDER: readonly StatusKind[] = ['pending', 'completed', 'running']

export type PendingKind = 'approval' | 'plan-review' | 'question' | 'other'

/** Minimal slice of `SessionSummary` the island reads. */
export interface SessionRow {
  readonly id: string
  readonly displayTitle: string
  readonly cwd?: string
  readonly origin?: 'subagent'
  readonly blank: boolean
  readonly running: boolean
  readonly updatedAt: number
  readonly retainedBy?: Readonly<Record<string, number | undefined>>
}

/** Minimal slice of `SessionListState`. */
export interface SessionListLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionRow | undefined>>
  readonly projectionsBySession?: Readonly<Record<string, {
    readonly values?: { readonly subagentCatalog?: readonly { readonly id: string }[] }
  } | undefined>>
}

/** Minimal slice of `SessionStatus`. */
export interface SessionStatusLike {
  readonly running: boolean | undefined
  readonly pendingInteraction: { readonly kind: string } | undefined
  readonly completionUnread: boolean
}

export type StatusMap = ReadonlyMap<string, SessionStatusLike>

/** Minimal slice of `WorkspaceSnapshot`. */
export interface WorkspacesLike {
  readonly items: readonly { readonly title: string; readonly sessionIds: readonly string[] }[]
  readonly archivedSessionIds: readonly string[]
}

export interface ActiveSession {
  readonly id: string
  readonly kind: StatusKind
  readonly title: string
  readonly workspace: string | undefined
  readonly pendingKind?: PendingKind
  readonly runningSubagents: number
  readonly updatedAt: number
  readonly current: boolean
}

export interface ActiveGroup {
  readonly kind: StatusKind
  readonly sessions: readonly ActiveSession[]
}

export interface Classification {
  readonly total: number
  readonly counts: Readonly<Record<StatusKind, number>>
  /** Non-empty groups in {@link STATUS_ORDER}. */
  readonly groups: readonly ActiveGroup[]
}

export const EMPTY_CLASSIFICATION: Classification = {
  total: 0,
  counts: { pending: 0, completed: 0, running: 0 },
  groups: [],
}

function pendingKindOf(kind: string): PendingKind {
  return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : 'other'
}

function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter((p) => p !== '')
  return parts.at(-1) ?? path
}

/** 会话 id → Workspace 名称。 */
export function workspaceIndex(workspaces: WorkspacesLike | undefined): ReadonlyMap<string, string> {
  const index = new Map<string, string>()
  for (const item of workspaces?.items ?? []) {
    for (const id of item.sessionIds) index.set(id, item.title)
  }
  return index
}

/** 行上显示的 Workspace 名：优先 Workspace 标题，其次工作目录的末级目录名。 */
export function workspaceLabel(row: SessionRow, index: ReadonlyMap<string, string>): string | undefined {
  return index.get(row.id) ?? (row.cwd === undefined ? undefined : basename(row.cwd))
}

/** 灵动岛只关心侧边栏可见的会话：排除子代理、空白和已归档会话。 */
export function isListed(row: SessionRow | undefined, archived: ReadonlySet<string>): row is SessionRow {
  return row !== undefined && row.origin !== 'subagent' && !row.blank && !archived.has(row.id)
}

/**
 * Decide one Session's island status, or `undefined` when it is not active.
 * Precedence: pending interaction → unread completion → running.
 */
export function statusOf(row: SessionRow, status: SessionStatusLike | undefined): StatusKind | undefined {
  if (status?.pendingInteraction !== undefined) return 'pending'
  if (status?.completionUnread === true) return 'completed'
  if ((status?.running ?? row.running) === true) return 'running'
  return undefined
}

/**
 * Classify every eligible Session into the three ordered groups.
 * Excluded: subagent-origin Sessions, archived Sessions, blank Sessions.
 */
export function classify(
  list: SessionListLike | undefined,
  statuses: StatusMap | undefined,
  workspaces: WorkspacesLike | undefined,
): Classification {
  if (list === undefined) return EMPTY_CLASSIFICATION
  const archived = new Set(workspaces?.archivedSessionIds ?? [])
  const workspaceOf = workspaceIndex(workspaces)
  const buckets: Record<StatusKind, ActiveSession[]> = { pending: [], completed: [], running: [] }

  for (const id of list.ids) {
    const row = list.byId[id]
    if (!isListed(row, archived)) continue
    const status = statuses?.get(id)
    const kind = statusOf(row, status)
    if (kind === undefined) continue
    const children = list.projectionsBySession?.[id]?.values?.subagentCatalog ?? []
    let runningSubagents = 0
    for (const child of children) {
      if ((statuses?.get(child.id)?.running ?? list.byId[child.id]?.running) === true) runningSubagents += 1
    }
    const pending = status?.pendingInteraction
    buckets[kind].push({
      id,
      kind,
      title: row.displayTitle,
      workspace: workspaceLabel(row, workspaceOf),
      ...(pending === undefined ? {} : { pendingKind: pendingKindOf(pending.kind) }),
      runningSubagents,
      updatedAt: row.updatedAt,
      current: (row.retainedBy?.mainView ?? 0) > 0,
    })
  }

  const groups: ActiveGroup[] = []
  for (const kind of STATUS_ORDER) {
    const sessions = buckets[kind].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    if (sessions.length > 0) groups.push({ kind, sessions })
  }
  const counts = {
    pending: buckets.pending.length,
    completed: buckets.completed.length,
    running: buckets.running.length,
  }
  return { total: counts.pending + counts.completed + counts.running, counts, groups }
}

/** Structural equality used to keep the derived value stable across unrelated list updates. */
export function sameClassification(a: Classification, b: Classification): boolean {
  if (a.total !== b.total || a.groups.length !== b.groups.length) return false
  for (let g = 0; g < a.groups.length; g += 1) {
    const left = a.groups[g]!
    const right = b.groups[g]!
    if (left.kind !== right.kind || left.sessions.length !== right.sessions.length) return false
    for (let i = 0; i < left.sessions.length; i += 1) {
      const x = left.sessions[i]!
      const y = right.sessions[i]!
      if (x.id !== y.id || x.title !== y.title || x.workspace !== y.workspace || x.pendingKind !== y.pendingKind
        || x.runningSubagents !== y.runningSubagents || x.updatedAt !== y.updatedAt || x.current !== y.current) return false
    }
  }
  return true
}

/** Display a count in the compact badge. */
export function badgeLabel(n: number): string {
  return n > 99 ? '99+' : String(n)
}

/** 历史会话默认显示的条数，以及每次「查看更多」追加的条数。 */
export const HISTORY_PAGE = 5
/** 历史会话最多显示的条数。 */
export const HISTORY_LIMIT = 15

/** 历史会话：当前没有活动状态、但最近活动过的会话。 */
export interface HistorySession {
  readonly id: string
  readonly title: string
  readonly workspace: string | undefined
  readonly updatedAt: number
  readonly current: boolean
}

/**
 * 最近活动过、当前不处于待处理 / 已完成 / 进行中的会话，按 `updatedAt` 倒序，最多 `limit` 个。
 * 与活动会话互斥，不参与计数；排除规则与 {@link classify} 相同。
 */
export function recentHistory(
  list: SessionListLike | undefined,
  statuses: StatusMap | undefined,
  workspaces: WorkspacesLike | undefined,
  limit: number = HISTORY_LIMIT,
): readonly HistorySession[] {
  if (list === undefined || limit <= 0) return []
  const archived = new Set(workspaces?.archivedSessionIds ?? [])
  const workspaceOf = workspaceIndex(workspaces)
  const rows: SessionRow[] = []
  for (const id of list.ids) {
    const row = list.byId[id]
    if (!isListed(row, archived)) continue
    if (statusOf(row, statuses?.get(id)) !== undefined) continue
    rows.push(row)
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  return rows.slice(0, limit).map((row) => ({
    id: row.id,
    title: row.displayTitle,
    workspace: workspaceLabel(row, workspaceOf),
    updatedAt: row.updatedAt,
    current: (row.retainedBy?.mainView ?? 0) > 0,
  }))
}

/** 历史列表的结构相等，用于在无关的列表更新中保持引用稳定。 */
export function sameHistory(a: readonly HistorySession[], b: readonly HistorySession[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!
    const y = b[i]!
    if (x.id !== y.id || x.title !== y.title || x.workspace !== y.workspace || x.updatedAt !== y.updatedAt || x.current !== y.current) return false
  }
  return true
}

/** 打开面板时历史会话是否默认展开：没有活动会话时展开，有活动会话时收拢。 */
export function historyOpenByDefault(activeTotal: number): boolean {
  return activeTotal === 0
}

/** 「查看更多」后应显示的条数：每次追加一页，不超过可用条数和上限。 */
export function nextHistoryCount(shown: number, available: number): number {
  return Math.min(shown + HISTORY_PAGE, available, HISTORY_LIMIT)
}
