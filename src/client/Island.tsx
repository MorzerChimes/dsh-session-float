/**
 * The island: a fixed, corner-anchored surface in `shell.overlay` that
 * morphs between a collapsed pill and an expanded panel (session list or
 * settings). Motion drives the layout morph; dragging bypasses React renders
 * and commits a corner-anchored position on release.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domMax, m, useAnimationControls, type Transition } from 'motion/react'
import {
  classify, sameClassification, STATUS_ORDER, EMPTY_CLASSIFICATION,
  recentHistory, sameHistory, historyOpenByDefault, nextHistoryCount, HISTORY_PAGE, subagentElapsed,
  type ActiveSession, type Classification, type HistorySession, type RunningSubagent, type SessionListLike, type StatusKind, type StatusMap, type WorkspacesLike,
} from './classify.ts'
import {
  anchorStyle, clampPosition, DRAG_THRESHOLD, isBottom, isRight, panelBudget, positionFromRect, transformOrigin,
  type Position, type Size,
} from './placement.ts'
import { isIslandVisible, type PrefsStore } from './prefs.ts'
import type { ObservableValue, Scheme } from './theme.ts'
import { formatDuration, formatTokens, relative, wrapT, type Translate } from './locales.ts'
import { ActivityDot, AgentIcon, Badge, ChevronIcon, GearIcon, HistoryIcon, StatusIcon } from './icons.tsx'
import { SettingsForm } from './SettingsForm.tsx'
import css from './island.module.css'

type SelectorHook<T> = <S>(selector: (value: T) => S, equal?: (a: S, b: S) => boolean) => S

/** ui-layout `PanelInfo` 中本插件用到的部分。 */
export interface PanelInfoLike {
  readonly activePanelId: string | null
}

export interface IslandInjected {
  readonly openSession: (id: string) => void
  readonly prefs: PrefsStore
  readonly scheme: ObservableValue<Scheme>
}

export interface IslandProps extends IslandInjected {
  readonly useSessions?: SelectorHook<SessionListLike>
  readonly useSessionStatus?: SelectorHook<StatusMap>
  readonly useWorkspaces?: SelectorHook<WorkspacesLike>
  /** ui-layout 的主面板选择；activePanelId 为 null 时显示的是会话页。 */
  readonly usePanelInfo?: SelectorHook<PanelInfoLike>
  readonly t?: (key: string, params?: Record<string, unknown>) => string
}

const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }
const CONTENT_IN: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1], delay: 0.08 }
const CONTENT_OUT: Transition = { duration: 0.1, ease: 'easeOut' }
const PANEL_WIDTH = 380
const COLLAPSED_SIZE: Size = { width: 120, height: 36 }

const identity = <T,>(value: T) => value
const noHook = <T,>(fallback: T): SelectorHook<T> => ((selector: (value: T) => unknown) => selector(fallback)) as SelectorHook<T>
const EMPTY_STATUS: StatusMap = new Map()
const EMPTY_HISTORY: readonly HistorySession[] = []

function useViewport(): Size {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight })
  const [size, setSize] = useState<Size>(read)
  useEffect(() => {
    const onResize = () => setSize(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

function useNow(active: boolean, interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [active, interval])
  return now
}

/** Keep the previous classification object while its content is unchanged. */
function useStableClassification(next: Classification): Classification {
  const ref = useRef(next)
  if (!sameClassification(ref.current, next)) ref.current = next
  return ref.current
}

/** 内容不变时沿用上一次的历史列表，避免无关的列表更新引起重渲染。 */
function useStableHistory(next: readonly HistorySession[]): readonly HistorySession[] {
  const ref = useRef(next)
  if (!sameHistory(ref.current, next)) ref.current = next
  return ref.current
}

/** 历史会话分组的展开状态与已显示条数，每次打开面板时重置。 */
export interface HistoryView {
  readonly open: boolean
  readonly shown: number
}

function ariaSummary(t: Translate, c: Classification): string {
  if (c.total === 0) return t('aria.none')
  const parts = STATUS_ORDER.filter((k) => c.counts[k] > 0).map((k) => `${c.counts[k]} ${t(`status.${k}`)}`).join('，')
  return t('aria.collapsed', { total: c.total, parts })
}

/**
 * Root hooks arrive from other plugins' root contributions and may appear
 * after first render; remount on presence changes so the inner component
 * always calls the same hooks in the same order.
 */
export function Island(props: IslandProps) {
  const presence = `${props.useSessions ? 1 : 0}${props.useSessionStatus ? 1 : 0}${props.useWorkspaces ? 1 : 0}${props.usePanelInfo ? 1 : 0}`
  return <IslandGate key={presence} {...props} />
}

/** 开启「仅在会话页中显示」时，在插件、自动化任务等全局页面中不渲染灵动岛。 */
function IslandGate(props: IslandProps) {
  const usePanelInfo = props.usePanelInfo ?? noHook<PanelInfoLike>({ activePanelId: null })
  const activePanelId = usePanelInfo((info) => info.activePanelId)
  const onlyInConversation = useSyncExternalStore(props.prefs.subscribe, () => props.prefs.getSnapshot().onlyInConversation)
  if (!isIslandVisible({ onlyInConversation }, activePanelId)) return null
  return <IslandInner {...props} />
}

function useElementSize(ref: { current: HTMLElement | null }, fallback: Size): Size {
  const [size, setSize] = useState<Size>(fallback)
  useEffect(() => {
    const el = ref.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const width = el.offsetWidth
      const height = el.offsetHeight
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function IslandInner(props: IslandProps) {
  const { prefs, scheme: schemeSource, openSession } = props
  const t = useMemo(() => wrapT(props.t), [props.t])
  const useSessions = props.useSessions ?? noHook<SessionListLike | undefined>(undefined)
  const useSessionStatus = props.useSessionStatus ?? noHook<StatusMap>(EMPTY_STATUS)
  const useWorkspaces = props.useWorkspaces ?? noHook<WorkspacesLike | undefined>(undefined)
  const list = useSessions(identity)
  const statuses = useSessionStatus(identity)
  const workspaces = useWorkspaces(identity)
  const classification = useStableClassification(useMemo(
    () => (list === undefined ? EMPTY_CLASSIFICATION : classify(list, statuses, workspaces)),
    [list, statuses, workspaces],
  ))

  const pref = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot)
  const scheme = useSyncExternalStore(schemeSource.subscribe, schemeSource.getSnapshot)
  const viewport = useViewport()
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<'list' | 'settings'>('list')
  const now = useNow(expanded)
  // 历史会话只在面板展开时计算；它不参与收纳态的计数。
  const history = useStableHistory(useMemo(
    () => (expanded ? recentHistory(list, statuses, workspaces) : EMPTY_HISTORY),
    [expanded, list, statuses, workspaces],
  ))
  const [historyView, setHistoryView] = useState<HistoryView>({ open: false, shown: HISTORY_PAGE })
  // 展开了子智能体列表的父会话；每次打开面板时清空。
  const [openSubagents, setOpenSubagents] = useState<ReadonlySet<string>>(() => new Set())
  const toggleSubagents = useCallback((id: string) => {
    setOpenSubagents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const suppressClick = useRef(false)

  const shellRef = useRef<HTMLDivElement>(null)
  /** Move focus into the panel when it mounts, unless focus already sits inside the island. */
  const focusOnMount = useCallback((el: HTMLDivElement | null) => {
    if (el === null) return
    const root = rootRef.current
    if (root !== null && root.contains(document.activeElement) && document.activeElement !== pillRef.current) return
    el.focus({ preventScroll: true })
  }, [])
  const measured = useElementSize(shellRef, COLLAPSED_SIZE)
  const position = clampPosition(pref.position, expanded ? COLLAPSED_SIZE : measured, viewport)
  const budget = panelBudget(position, viewport)
  const corner = position.corner

  const collapse = useCallback((restoreFocus = false) => {
    setExpanded(false)
    setView('list')
    if (restoreFocus) requestAnimationFrame(() => pillRef.current?.focus({ preventScroll: true }))
  }, [])

  // Outside click (capture phase, never prevents the click itself) and Esc.
  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      if (!prefs.getSnapshot().collapseOnOutsideClick) return
      const root = rootRef.current
      if (root !== null && !event.composedPath().includes(root)) collapse()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const root = rootRef.current
      if (root !== null && root.contains(document.activeElement)) {
        event.preventDefault()
        event.stopPropagation()
        collapse(true)
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, collapse, prefs])

  // Drag: transform the root directly while moving, commit a corner position on release.
  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const root = rootRef.current
    const target = event.currentTarget
    if (root === null) return
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    let dragging = false
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        dragging = true
        try { target.setPointerCapture(pointerId) } catch { /* pointer already released */ }
        root.dataset.dragging = 'true'
      }
      root.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (!dragging) return
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      const rect = root.getBoundingClientRect()
      const next = positionFromRect(
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      )
      root.style.transform = ''
      delete root.dataset.dragging
      prefs.update({ position: next })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }, [prefs])

  const onPillClick = () => {
    if (suppressClick.current) return
    // 有活动会话时历史会话默认收拢，没有时默认展开；以打开面板这一刻为准。
    setHistoryView({ open: historyOpenByDefault(classification.total), shown: HISTORY_PAGE })
    setOpenSubagents(new Set())
    setExpanded(true)
  }

  const open = (session: { readonly id: string }) => {
    openSession(session.id)
    collapse()
  }

  // 当前显示出来的子智能体列表及其行数，变化时面板高度需要过渡。
  const subagentKey = classification.groups
    .flatMap((g) => g.sessions)
    .filter((s) => s.subagents.length > 0 && openSubagents.has(s.id))
    .map((s) => `${s.id}:${s.subagents.length}`)
    .join(',')
  // Layout animations run only when this key changes, so dragging never animates.
  const layoutKey = `${expanded}|${view}|${pref.collapsedStyle}|${classification.counts.pending}|${classification.counts.completed}|${classification.counts.running}|${historyView.open}|${historyView.shown}|${subagentKey}`

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <LazyMotion features={domMax} strict>
        <div
          ref={rootRef}
          className={css.root}
          data-sf-scheme={scheme}
          data-corner={corner}
          style={{ ...anchorStyle(position), alignItems: isRight(corner) ? 'flex-end' : 'flex-start', justifyContent: isBottom(corner) ? 'flex-end' : 'flex-start' }}
        >
          <m.div
            ref={shellRef}
            layout
            layoutDependency={layoutKey}
            className={css.shell}
            data-expanded={expanded || undefined}
            data-empty={classification.total === 0 || undefined}
            style={{ borderRadius: expanded ? 22 : 18, transformOrigin: transformOrigin(corner) }}
            role={expanded ? 'dialog' : undefined}
            aria-label={expanded ? t('island.title') : undefined}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {expanded ? (
                <m.div
                  key="panel"
                  ref={focusOnMount}
                  tabIndex={-1}
                  layout="position"
                  layoutDependency={layoutKey}
                  className={css.panel}
                  style={{ width: Math.min(PANEL_WIDTH, budget.width) }}
                  initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: CONTENT_IN }}
                  exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', transition: CONTENT_OUT }}
                >
                  <Panel
                    t={t}
                    view={view}
                    setView={setView}
                    classification={classification}
                    history={history}
                    historyView={historyView}
                    onHistoryView={setHistoryView}
                    openSubagents={openSubagents}
                    onToggleSubagents={toggleSubagents}
                    now={now}
                    prefs={prefs}
                    maxHeight={budget.height}
                    layoutKey={layoutKey}
                    onOpen={open}
                    onCollapse={() => collapse(true)}
                    onDragStart={startDrag}
                  />
                </m.div>
              ) : (
                <m.button
                  key="pill"
                  ref={pillRef}
                  type="button"
                  layout="position"
                  layoutDependency={layoutKey}
                  className={css.pill}
                  data-style={pref.collapsedStyle}
                  aria-expanded={false}
                  aria-label={ariaSummary(t, classification)}
                  onPointerDown={startDrag}
                  onClick={onPillClick}
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  animate={{ opacity: classification.total === 0 ? 0.6 : 1, filter: 'blur(0px)', transition: CONTENT_IN }}
                  exit={{ opacity: 0, filter: 'blur(4px)', transition: CONTENT_OUT }}
                >
                  <Collapsed t={t} classification={classification} style={pref.collapsedStyle} layoutKey={layoutKey} />
                </m.button>
              )}
            </AnimatePresence>
          </m.div>
          <span className={css.srOnly} aria-live="polite">{ariaSummary(t, classification)}</span>
        </div>
      </LazyMotion>
    </MotionConfig>
  )
}

const SEGMENT_IN = { opacity: 1, scale: 1 }
const SEGMENT_OUT = { opacity: 0, scale: 0.6 }

function Collapsed({ t, classification, style, layoutKey }: {
  t: Translate
  classification: Classification
  style: 'compact' | 'detailed'
  layoutKey: string
}) {
  const kinds = STATUS_ORDER.filter((k) => classification.counts[k] > 0)
  const pulse = useAnimationControls()
  const lastPending = useRef(classification.counts.pending)
  useEffect(() => {
    if (classification.counts.pending > lastPending.current) {
      void pulse.start({ scale: [1, 1.08, 1], transition: { duration: 0.26, ease: 'easeOut' } })
    }
    lastPending.current = classification.counts.pending
  }, [classification.counts.pending, pulse])

  const compact = style === 'compact'
  return (
    <span className={css.pillInner} data-style={style}>
      <m.span layout="position" layoutDependency={layoutKey} className={css.seg} data-kind="total">
        {compact ? <Badge kind="total" count={classification.total} /> : <ActivityDot pulse={classification.counts.running > 0} />}
        {!compact && <RollingNumber value={classification.total} />}
        {!compact && <span className={css.segLabel}>{t('activity')}</span>}
      </m.span>
      <AnimatePresence mode="popLayout" initial={false}>
        {kinds.length > 0 && (
          <m.span key="divider" layout="position" layoutDependency={layoutKey} className={css.divider}
            initial={SEGMENT_OUT} animate={SEGMENT_IN} exit={SEGMENT_OUT} />
        )}
        {kinds.map((kind) => (
          <m.span
            key={kind}
            layout="position"
            layoutDependency={layoutKey}
            className={css.seg}
            data-kind={kind}
            initial={SEGMENT_OUT}
            animate={SEGMENT_IN}
            exit={SEGMENT_OUT}
          >
            <m.span className={css.segBody} animate={kind === 'pending' ? pulse : undefined}>
              {compact ? <Badge kind={kind} count={classification.counts[kind]} /> : (
                <>
                  <StatusIcon kind={kind} />
                  <RollingNumber value={classification.counts[kind]} />
                  <span className={css.segLabel}>{t(`status.${kind}`)}</span>
                </>
              )}
            </m.span>
          </m.span>
        ))}
      </AnimatePresence>
    </span>
  )
}

/** Old digit slides up and out, the new one slides in from below. */
function RollingNumber({ value }: { value: number }) {
  return (
    <span className={css.num}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.b
          key={value}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: 0.16, ease: 'easeOut' } }}
          exit={{ y: -8, opacity: 0, transition: { duration: 0.16, ease: 'easeIn' } }}
        >
          {value}
        </m.b>
      </AnimatePresence>
    </span>
  )
}

function Panel(props: {
  t: Translate
  view: 'list' | 'settings'
  setView: (view: 'list' | 'settings') => void
  classification: Classification
  history: readonly HistorySession[]
  historyView: HistoryView
  onHistoryView: (view: HistoryView) => void
  openSubagents: ReadonlySet<string>
  onToggleSubagents: (id: string) => void
  now: number
  prefs: PrefsStore
  maxHeight: number
  layoutKey: string
  onOpen: (session: { readonly id: string }) => void
  onCollapse: () => void
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const { t, view, setView, classification, onCollapse, onDragStart } = props
  const stop = (event: ReactPointerEvent) => event.stopPropagation()
  const direction = view === 'settings' ? 1 : -1
  return (
    <>
      <div className={css.header} onPointerDown={onDragStart}>
        <span className={css.handle} aria-hidden="true" title={t('action.drag')} />
        {view === 'settings' && (
          <button type="button" className={css.iconButton} aria-label={t('action.back')} onPointerDown={stop} onClick={() => setView('list')}>
            <ChevronIcon dir="left" />
          </button>
        )}
        <span className={css.title}>{view === 'list' ? t('island.title') : t('settings.title')}</span>
        {view === 'list' && <span className={css.count}>{classification.total}</span>}
        <span className={css.spacer} />
        {view === 'list' && (
          <button type="button" className={css.iconButton} aria-label={t('action.settings')} title={t('action.settings')} onPointerDown={stop} onClick={() => setView('settings')}>
            <GearIcon />
          </button>
        )}
        <button type="button" className={css.iconButton} aria-label={t('action.collapse')} title={t('action.collapse')} onPointerDown={stop} onClick={onCollapse}>
          <ChevronIcon dir="up" />
        </button>
      </div>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <m.div
          key={view}
          className={css.body}
          style={{ maxHeight: Math.max(160, props.maxHeight - 52) }}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: 24 * d }),
            center: { opacity: 1, x: 0, transition: { duration: 0.18, ease: 'easeOut' } },
            exit: (d: number) => ({ opacity: 0, x: -24 * d, transition: { duration: 0.12, ease: 'easeIn' } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {view === 'list'
            ? <SessionList {...props} />
            : <SettingsForm prefs={props.prefs} t={t} variant="island" />}
        </m.div>
      </AnimatePresence>
    </>
  )
}

const ROW_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
} as const

/**
 * 副标题中的状态说明。进行中不写文字（分组和转圈图标已经表达了），
 * 待处理写具体类型，已完成写「未查看」。
 */
function statusTextOf(t: Translate, session: ActiveSession): string | undefined {
  if (session.kind === 'pending') return t(`pending.${session.pendingKind ?? 'other'}`)
  if (session.kind === 'completed') return t('detail.completed')
  return undefined
}

/** 副标题：Workspace · 状态说明 · 子智能体徽标 · 当前会话，缺的项连同分隔点一起省略。 */
function RowMeta({ t, session }: { t: Translate; session: ActiveSession }) {
  const items: { key: string; node: ReactNode }[] = []
  if (session.workspace !== undefined) items.push({ key: 'ws', node: <span className={css.rowWorkspace}>{session.workspace}</span> })
  const status = statusTextOf(t, session)
  if (status !== undefined) items.push({ key: 'status', node: <span className={css.rowDetail}>{status}</span> })
  if (session.runningSubagents > 0) items.push({ key: 'sub', node: <SubagentBadge t={t} count={session.runningSubagents} /> })
  if (session.current) items.push({ key: 'current', node: <span className={css.rowDetail}>{t('detail.current')}</span> })
  if (items.length === 0) return null
  return (
    <span className={css.rowMeta}>
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 && <span className={css.rowSep} aria-hidden="true">·</span>}
          {item.node}
        </Fragment>
      ))}
    </span>
  )
}

/** 蓝色的智能体图标加数量，代替「N 个子智能体运行中」；悬停和读屏仍给出完整说法。 */
function SubagentBadge({ t, count }: { t: Translate; count: number }) {
  const label = t('subagent.running', { n: count })
  return (
    <span className={css.subBadge} title={label}>
      <AgentIcon />
      <span aria-hidden="true">{count}</span>
      <span className={css.srOnly}>{label}</span>
    </span>
  )
}

function SessionList({ t, classification, history, historyView, onHistoryView, openSubagents, onToggleSubagents, now, onOpen }: {
  t: Translate
  classification: Classification
  history: readonly HistorySession[]
  historyView: HistoryView
  onHistoryView: (view: HistoryView) => void
  openSubagents: ReadonlySet<string>
  onToggleSubagents: (id: string) => void
  now: number
  onOpen: (session: { readonly id: string }) => void
}) {
  if (classification.total === 0 && history.length === 0) {
    return <div className={css.empty}>{t('empty')}</div>
  }
  return (
    <m.div
      className={css.list}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.12 } } }}
    >
      {classification.total === 0 && (
        <m.div variants={ROW_VARIANTS} className={css.empty} data-compact="">{t('empty')}</m.div>
      )}
      {classification.groups.map((group) => (
        <section key={group.kind} className={css.group} data-kind={group.kind}>
          <m.div variants={ROW_VARIANTS} className={css.groupHead}>
            <span className={css.groupLabel}>{t(`status.${group.kind}`)}</span>
            <span className={css.groupCount}>{group.sessions.length}</span>
            <span className={css.groupRule} />
          </m.div>
          {group.sessions.map((session) => (
            <ActiveRow
              key={session.id}
              t={t}
              session={session}
              open={openSubagents.has(session.id)}
              onToggle={onToggleSubagents}
              now={now}
              onOpen={onOpen}
            />
          ))}
        </section>
      ))}
      {history.length > 0 && (
        <HistorySection t={t} history={history} view={historyView} onView={onHistoryView} now={now} onOpen={onOpen} />
      )}
      <div className={css.hint}>{t('hint')}</div>
    </m.div>
  )
}

/**
 * 活动会话行。有正在运行的子智能体时，右侧显示展开按钮，展开后在行下方列出这些子智能体。
 * 跳转按钮和展开按钮是并列的两个按钮（按钮不能嵌套）；展开按钮叠放在行的右端。
 */
function ActiveRow({ t, session, open, onToggle, now, onOpen }: {
  t: Translate
  session: ActiveSession
  open: boolean
  onToggle: (id: string) => void
  now: number
  onOpen: (session: { readonly id: string }) => void
}) {
  const hasSubagents = session.subagents.length > 0
  const expanded = hasSubagents && open
  const listId = `sf-subagents-${session.id}`
  return (
    <m.div variants={ROW_VARIANTS} className={css.sessionRow}>
      <button
        type="button"
        className={css.rowButton}
        data-current={session.current || undefined}
        data-kind={session.kind}
        data-toggle={hasSubagents || undefined}
        aria-label={t('aria.open', { title: session.title })}
        onClick={() => onOpen(session)}
      >
        <span className={css.rowIcon}><StatusIcon kind={session.kind} size={14} /></span>
        <span className={css.rowText}>
          <span className={css.rowTitle}>{session.title}</span>
          <RowMeta t={t} session={session} />
        </span>
        <span className={css.rowTime}>{relative(t, session.updatedAt, now)}</span>
      </button>
      {hasSubagents && (
        <button
          type="button"
          className={css.rowToggle}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-label={expanded ? t('subagent.collapse') : t('subagent.expand', { n: session.subagents.length })}
          title={expanded ? t('subagent.collapse') : t('subagent.expand', { n: session.subagents.length })}
          onClick={() => onToggle(session.id)}
        >
          <span className={css.rowToggleChevron} data-open={expanded || undefined}><ChevronIcon dir="down" /></span>
        </button>
      )}
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="subagents"
            id={listId}
            role="group"
            aria-label={t('subagent.list', { title: session.title })}
            className={css.subList}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transition: { duration: 0.2, ease: 'easeOut' } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.14, ease: 'easeIn' } }}
          >
            {session.subagents.map((sub) => <SubagentRow key={sub.id} t={t} subagent={sub} onOpen={onOpen} />)}
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}

/** 一个正在运行的子智能体：名称、任务、运行时长、token。点击跳转到子智能体会话。 */
function SubagentRow({ t, subagent, onOpen }: {
  t: Translate
  subagent: RunningSubagent
  onOpen: (session: { readonly id: string }) => void
}) {
  const hasMeta = subagent.task !== undefined || subagent.tokens !== undefined
  return (
    <button
      type="button"
      className={css.subRow}
      aria-label={t('aria.openSubagent', { name: subagent.name })}
      onClick={() => onOpen(subagent)}
    >
      <span className={css.subIcon}><StatusIcon kind="running" size={11} /></span>
      <span className={css.rowText}>
        <span className={css.subName} title={subagent.name}>{subagent.name}</span>
        {hasMeta && (
          <span className={css.subMeta}>
            {subagent.task !== undefined && <span className={css.subTask} title={subagent.task}>{subagent.task}</span>}
            {subagent.task !== undefined && subagent.tokens !== undefined && <span className={css.rowSep} aria-hidden="true">·</span>}
            {subagent.tokens !== undefined && <span className={css.subTokens}>{formatTokens(t, subagent.tokens)}</span>}
          </span>
        )}
      </span>
      <LiveDuration t={t} subagent={subagent} />
    </button>
  )
}

/** 运行时长每秒刷新；计时器只在子智能体列表展开时存在，不会让整个面板每秒重渲染。 */
function LiveDuration({ t, subagent }: { t: Translate; subagent: RunningSubagent }) {
  const now = useNow(subagent.activeSince !== undefined, 1000)
  const elapsed = subagentElapsed(subagent, now)
  if (elapsed === undefined) return null
  return <span className={css.subTime}>{formatDuration(t, elapsed)}</span>
}

/**
 * 历史会话：最近活动过、当前没有活动状态的会话。分组头是展开 / 收拢开关；
 * 展开后先显示 5 个，「查看更多」每次再加 5 个，最多 15 个。
 */
function HistorySection({ t, history, view, onView, now, onOpen }: {
  t: Translate
  history: readonly HistorySession[]
  view: HistoryView
  onView: (view: HistoryView) => void
  now: number
  onOpen: (session: { readonly id: string }) => void
}) {
  const shown = history.slice(0, view.shown)
  const more = nextHistoryCount(view.shown, history.length) > shown.length
  const listId = 'sf-history-list'
  return (
    <section className={css.group} data-kind="history">
      <m.button
        type="button"
        variants={ROW_VARIANTS}
        className={css.groupToggle}
        aria-expanded={view.open}
        aria-controls={listId}
        onClick={() => onView({ open: !view.open, shown: view.shown })}
      >
        <span className={css.groupLabel}>{t('history.title')}</span>
        <span className={css.groupRule} />
        <span className={css.groupChevron} data-open={view.open || undefined}><ChevronIcon dir="down" /></span>
      </m.button>
      {view.open && (
        <m.div
          id={listId}
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
        >
          {shown.map((session) => (
            <m.button
              key={session.id}
              type="button"
              variants={ROW_VARIANTS}
              className={css.rowButton}
              data-current={session.current || undefined}
              data-kind="history"
              aria-label={t('aria.open', { title: session.title })}
              onClick={() => onOpen(session)}
            >
              <span className={css.rowIcon}><HistoryIcon size={14} /></span>
              <span className={css.rowText}>
                <span className={css.rowTitle}>{session.title}</span>
                {(session.workspace !== undefined || session.current) && (
                  <span className={css.rowMeta}>
                    {session.workspace !== undefined && <span className={css.rowWorkspace}>{session.workspace}</span>}
                    {session.workspace !== undefined && session.current && <span className={css.rowSep} aria-hidden="true">·</span>}
                    {session.current && <span className={css.rowDetail}>{t('detail.current')}</span>}
                  </span>
                )}
              </span>
              <span className={css.rowTime}>{relative(t, session.updatedAt, now)}</span>
            </m.button>
          ))}
          {more && (
            <m.button
              type="button"
              variants={ROW_VARIANTS}
              className={css.moreButton}
              onClick={() => onView({ open: true, shown: nextHistoryCount(view.shown, history.length) })}
            >
              {t('history.more')}
            </m.button>
          )}
        </m.div>
      )}
    </section>
  )
}
