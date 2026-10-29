/**
 * The island: a fixed, corner-anchored surface in `shell.overlay` that
 * morphs between a collapsed pill and an expanded panel (session list or
 * settings). Motion drives the layout morph; dragging bypasses React renders
 * and commits a corner-anchored position on release.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domMax, m, useAnimationControls, type Transition } from 'motion/react'
import {
  classify, sameClassification, STATUS_ORDER, EMPTY_CLASSIFICATION,
  type ActiveSession, type Classification, type SessionListLike, type StatusKind, type StatusMap, type WorkspacesLike,
} from './classify.ts'
import {
  anchorStyle, clampPosition, DRAG_THRESHOLD, isBottom, isRight, panelBudget, positionFromRect, transformOrigin,
  type Position, type Size,
} from './placement.ts'
import { isIslandVisible, type PrefsStore } from './prefs.ts'
import type { ObservableValue, Scheme } from './theme.ts'
import { relative, wrapT, type Translate } from './locales.ts'
import { ActivityDot, Badge, ChevronIcon, GearIcon, StatusIcon } from './icons.tsx'
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

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

/** Keep the previous classification object while its content is unchanged. */
function useStableClassification(next: Classification): Classification {
  const ref = useRef(next)
  if (!sameClassification(ref.current, next)) ref.current = next
  return ref.current
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
    setExpanded(true)
  }

  const open = (session: ActiveSession) => {
    openSession(session.id)
    collapse()
  }

  // Layout animations run only when this key changes, so dragging never animates.
  const layoutKey = `${expanded}|${view}|${pref.collapsedStyle}|${classification.counts.pending}|${classification.counts.completed}|${classification.counts.running}`

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
  now: number
  prefs: PrefsStore
  maxHeight: number
  layoutKey: string
  onOpen: (session: ActiveSession) => void
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

function detailOf(t: Translate, session: ActiveSession): string {
  const parts: string[] = []
  if (session.kind === 'pending') parts.push(t(`pending.${session.pendingKind ?? 'other'}`))
  else if (session.kind === 'completed') parts.push(t('detail.completed'))
  else parts.push(t('detail.running'))
  if (session.runningSubagents > 0) parts.push(t('detail.subagents', { n: session.runningSubagents }))
  if (session.current) parts.push(t('detail.current'))
  return parts.join(' · ')
}

function SessionList({ t, classification, now, onOpen }: {
  t: Translate
  classification: Classification
  now: number
  onOpen: (session: ActiveSession) => void
}) {
  if (classification.total === 0) {
    return <div className={css.empty}>{t('empty')}</div>
  }
  return (
    <m.div
      className={css.list}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.12 } } }}
    >
      {classification.groups.map((group) => (
        <section key={group.kind} className={css.group} data-kind={group.kind}>
          <m.div variants={ROW_VARIANTS} className={css.groupHead}>
            <span className={css.groupLabel}>{t(`status.${group.kind}`)}</span>
            <span className={css.groupCount}>{group.sessions.length}</span>
            <span className={css.groupRule} />
          </m.div>
          {group.sessions.map((session) => (
            <m.button
              key={session.id}
              type="button"
              variants={ROW_VARIANTS}
              className={css.rowButton}
              data-current={session.current || undefined}
              data-kind={group.kind as StatusKind}
              aria-label={t('aria.open', { title: session.title })}
              onClick={() => onOpen(session)}
            >
              <span className={css.rowIcon}><StatusIcon kind={session.kind} size={14} /></span>
              <span className={css.rowText}>
                <span className={css.rowTitle}>{session.title}</span>
                <span className={css.rowMeta}>
                  {session.workspace !== undefined && (
                    <>
                      <span className={css.rowWorkspace}>{session.workspace}</span>
                      <span className={css.rowSep} aria-hidden="true">·</span>
                    </>
                  )}
                  <span className={css.rowDetail}>{detailOf(t, session)}</span>
                </span>
              </span>
              <span className={css.rowTime}>{relative(t, session.updatedAt, now)}</span>
              <span className={css.rowArrow}><ChevronIcon dir="right" /></span>
            </m.button>
          ))}
        </section>
      ))}
      <div className={css.hint}>{t('hint')}</div>
    </m.div>
  )
}
