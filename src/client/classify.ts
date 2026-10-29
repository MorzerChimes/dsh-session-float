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
  const workspaceOf = new Map<string, string>()
  for (const item of workspaces?.items ?? []) {
    for (const id of item.sessionIds) workspaceOf.set(id, item.title)
  }
  const buckets: Record<StatusKind, ActiveSession[]> = { pending: [], completed: [], running: [] }

  for (const id of list.ids) {
    const row = list.byId[id]
    if (row === undefined || row.origin === 'subagent' || row.blank || archived.has(id)) continue
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
      workspace: workspaceOf.get(id) ?? (row.cwd === undefined ? undefined : basename(row.cwd)),
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
