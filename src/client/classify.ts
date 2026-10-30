/**
 * Session classification for the island: pure functions over the Session
 * Controller list, the unified status map, and the Workspace snapshot.
 * The rules mirror ui-workspace's row status so both surfaces agree.
 */

export type StatusKind = 'pending' | 'completed' | 'running'

/** Fixed group order: pending first, completed second, running third. */
export const STATUS_ORDER: readonly StatusKind[] = ['pending', 'completed', 'running']

export type PendingKind = 'approval' | 'plan-review' | 'question' | 'other'

/** 子智能体行用到的 `subagentTiming` 投影：已结束轮次的累计时长，以及当前轮次的开始时间。 */
export interface SubagentTimingLike {
  readonly settledMs: number
  readonly active?: { readonly since: number; readonly through: number }
}

/** `tokenUsage` 投影：四个互不重叠的用量桶。 */
export interface TokenUsageLike {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** 会话行上本插件读取的投影值；子智能体详情来自这里。 */
export interface ProjectionValuesLike {
  readonly title?: string | null
  readonly subagentTiming?: SubagentTimingLike
  readonly tokenUsage?: TokenUsageLike
}

/** Minimal slice of `SessionSummary` the island reads. */
export interface SessionRow {
  readonly id: string
  readonly displayTitle: string
  readonly title?: string
  readonly cwd?: string
  readonly origin?: 'subagent'
  readonly blank: boolean
  readonly running: boolean
  readonly updatedAt: number
  readonly retainedBy?: Readonly<Record<string, number | undefined>>
  readonly projectionValues?: ProjectionValuesLike
}

/** 父会话 `subagentCatalog` 中的一项：直接子智能体。 */
export interface SubagentCatalogEntryLike {
  readonly id: string
  readonly mode?: string
  readonly label?: string
}

/** Minimal slice of `SessionListState`. */
export interface SessionListLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionRow | undefined>>
  readonly projectionsBySession?: Readonly<Record<string, {
    readonly values?: { readonly subagentCatalog?: readonly SubagentCatalogEntryLike[] }
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
  /** 正在运行的直接子智能体，按创建顺序；长度等于 `runningSubagents`。 */
  readonly subagents: readonly RunningSubagent[]
  readonly updatedAt: number
  readonly current: boolean
}

/** 展开父会话行后显示的一个正在运行的子智能体。 */
export interface RunningSubagent {
  readonly id: string
  /** 创建时的标签；没有标签时用子会话标题。 */
  readonly name: string
  /** 子会话自己的标题；与名称相同或还没有标题时省略。疑似被截断时以「…」结尾（见 {@link markClipped}）。 */
  readonly task?: string
  /** 已结束轮次的累计运行毫秒数；投影尚未加载时省略。 */
  readonly settledMs?: number
  /** 当前轮次的开始时间（epoch 毫秒）。 */
  readonly activeSince?: number
  /** 累计 token 用量；投影尚未加载时省略。 */
  readonly tokens?: number
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
 * 优先级与侧边栏 ui-workspace 的 `sessionStatuses` 一致：
 * 待处理 → 自身运行中 → 子智能体运行中（也算进行中）→ 未读完成。
 * 主会话本轮结束但子智能体还在跑时，侧边栏显示进行中，这里也归入进行中；
 * 子智能体全部结束后，如果完成还未查看，再进入已完成。
 */
export function statusOf(row: SessionRow, status: SessionStatusLike | undefined, runningSubagents = 0): StatusKind | undefined {
  if (status?.pendingInteraction !== undefined) return 'pending'
  if (selfRunning(row, status)) return 'running'
  if (runningSubagents > 0) return 'running'
  if (status?.completionUnread === true) return 'completed'
  return undefined
}

/** 会话自身是否在运行：实时状态优先，没有时用列表行的 `running`。 */
function selfRunning(row: SessionRow, status: SessionStatusLike | undefined): boolean {
  return (status?.running ?? row.running) === true
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
    const subagents = runningSubagentsOf(list, statuses, id)
    const kind = statusOf(row, status, subagents.length)
    if (kind === undefined) continue
    const pending = status?.pendingInteraction
    buckets[kind].push({
      id,
      kind,
      title: row.displayTitle,
      workspace: workspaceLabel(row, workspaceOf),
      ...(pending === undefined ? {} : { pendingKind: pendingKindOf(pending.kind) }),
      runningSubagents: subagents.length,
      subagents,
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

function tokenTotal(usage: TokenUsageLike | undefined): number | undefined {
  return usage === undefined ? undefined : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * DSH 默认组合（dsh-base 的 session-title 配置）由首条提示生成兜底标题时的上限：
 * 前 5 个词，且不超过 40 个 UTF-8 字节。子智能体不走 LLM 标题生成，标题就是这样截出来的，
 * 而且截断时不加省略号，例如「这是一个插件测试任务，请尽」。
 */
const FALLBACK_TITLE_WORDS = 5
const FALLBACK_TITLE_BYTES = 40
/** 单个字符最多 4 字节，所以按字节截断后的长度一定大于上限减 4。 */
const CLIPPED_MIN_BYTES = FALLBACK_TITLE_BYTES - 4

const utf8 = new TextEncoder()

/**
 * 标题达到兜底标题的词数或字节上限时，视为从更长的提示中截出来的，在末尾补「…」。
 * 客户端拿不到原始提示，只能按上限推断：恰好 5 个词、或恰好接近 40 字节的完整标题也会被补上省略号。
 */
export function markClipped(title: string): string {
  if (title.endsWith('…')) return title
  const words = title.split(' ').filter((w) => w !== '').length
  const clipped = words >= FALLBACK_TITLE_WORDS || utf8.encode(title).length > CLIPPED_MIN_BYTES
  return clipped ? `${title}…` : title
}

/**
 * 父会话正在运行的直接子智能体，按 `subagentCatalog` 的创建顺序。
 * 运行判断与侧边栏一致：实时状态优先，没有时用列表行的 `running`。
 * 外部执行（`mode: 'external'`）在本地没有会话，无法判断是否运行，不计入。
 */
export function runningSubagentsOf(
  list: SessionListLike,
  statuses: StatusMap | undefined,
  parentId: string,
): RunningSubagent[] {
  const result: RunningSubagent[] = []
  for (const entry of list.projectionsBySession?.[parentId]?.values?.subagentCatalog ?? []) {
    if (entry.mode === 'external') continue
    const row = list.byId[entry.id]
    if ((statuses?.get(entry.id)?.running ?? row?.running) !== true) continue
    const values = row?.projectionValues
    const projected = values?.title
    const raw = (typeof projected === 'string' && projected !== '' ? projected : undefined) ?? row?.title
    const title = raw === undefined ? undefined : markClipped(raw)
    const label = entry.label !== undefined && entry.label !== '' ? entry.label : undefined
    const name = label ?? title ?? row?.displayTitle ?? entry.id
    const timing = values?.subagentTiming
    const tokens = tokenTotal(values?.tokenUsage)
    result.push({
      id: entry.id,
      name,
      ...(title === undefined || title === name ? {} : { task: title }),
      ...(timing === undefined ? {} : { settledMs: timing.settledMs }),
      ...(timing?.active === undefined ? {} : { activeSince: timing.active.since }),
      ...(tokens === undefined ? {} : { tokens }),
    })
  }
  return result
}

/**
 * 子智能体已运行的毫秒数：已结束轮次的累计时长加上当前轮次到 `now` 的时长。
 * 还没有时长投影时返回 `undefined`，界面不显示时长。
 */
export function subagentElapsed(subagent: RunningSubagent, now: number): number | undefined {
  if (subagent.settledMs === undefined) return undefined
  if (subagent.activeSince === undefined) return subagent.settledMs
  return subagent.settledMs + Math.max(0, now - subagent.activeSince)
}

function sameSubagents(a: readonly RunningSubagent[], b: readonly RunningSubagent[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!
    const y = b[i]!
    if (x.id !== y.id || x.name !== y.name || x.task !== y.task || x.settledMs !== y.settledMs
      || x.activeSince !== y.activeSince || x.tokens !== y.tokens) return false
  }
  return true
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
        || x.runningSubagents !== y.runningSubagents || x.updatedAt !== y.updatedAt || x.current !== y.current
        || !sameSubagents(x.subagents, y.subagents)) return false
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
    if (statusOf(row, statuses?.get(id), runningSubagentsOf(list, statuses, id).length) !== undefined) continue
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
