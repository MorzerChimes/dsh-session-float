/** Status glyphs: detailed-mode icons and compact-mode number badges. */
import type { StatusKind } from './classify.ts'
import { badgeLabel } from './classify.ts'
import css from './island.module.css'

export function StatusIcon({ kind, size = 12 }: { kind: StatusKind; size?: number }) {
  if (kind === 'running') {
    return (
      <svg className={`${css.icon} ${css.spin}`} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.8" />
        <path d="M6 1.2 A4.8 4.8 0 0 1 10.8 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'completed') {
    return (
      <svg className={css.icon} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="6" fill="currentColor" />
        <path d="M3.4 6.1 L5.2 7.9 L8.7 4.3" fill="none" stroke="var(--sf-bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg className={css.icon} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="6" fill="currentColor" />
      <rect x="5.15" y="2.6" width="1.7" height="4.3" rx="0.85" fill="var(--sf-bg)" />
      <circle cx="6" cy="8.85" r="0.95" fill="var(--sf-bg)" />
    </svg>
  )
}

/**
 * 活动圆点。pulse 为 true 时（有进行中的会话）外圈周期性向外扩散并淡出，
 * 中心圆点同步轻跳一次，形成心跳感；动画为纯 CSS，见 island.module.css 的 sfRipple / sfBeat。
 */
export function ActivityDot({ pulse = false }: { pulse?: boolean }) {
  return (
    <svg className={css.icon} data-pulse={pulse || undefined} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {pulse && <circle className={css.activityRipple} cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="2" />}
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
      <circle className={css.activityCore} cx="7" cy="7" r="3.2" fill="currentColor" />
    </svg>
  )
}

/** Compact badge: the count sits in the center of the status logo. */
export function Badge({ kind, count }: { kind: StatusKind | 'total'; count: number }) {
  const label = badgeLabel(count)
  const small = label.length >= 3
  if (kind === 'running') {
    return (
      <span className={css.badge} data-kind={kind} data-small={small || undefined}>
        <svg className={`${css.badgeRing} ${css.spin}`} viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="9.6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.2" />
          <path d="M11 1.4 A9.6 9.6 0 0 1 20.6 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <span className={css.badgeNum}>{label}</span>
      </span>
    )
  }
  return (
    <span className={css.badge} data-kind={kind} data-small={small || undefined}>
      <span className={css.badgeNum}>{label}</span>
      {kind === 'pending' && (
        <svg className={css.badgeChip} data-pos="top" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="4.6" fill="var(--sf-bg)" />
          <circle cx="5" cy="5" r="3.6" fill="currentColor" />
          <rect x="4.45" y="2.7" width="1.1" height="2.6" rx="0.55" fill="#fff" />
          <circle cx="5" cy="6.6" r="0.6" fill="#fff" />
        </svg>
      )}
      {kind === 'completed' && (
        <svg className={css.badgeChip} data-pos="bottom" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="4.6" fill="var(--sf-bg)" />
          <circle cx="5" cy="5" r="3.6" fill="currentColor" />
          <path d="M3.3 5.1 L4.4 6.2 L6.6 3.9" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}

/** 历史会话行的图标：时钟，颜色跟随 currentColor。 */
export function HistoryIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className={css.icon} width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.2V7l1.9 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.6 1.8h2.8l.4 1.8 1.3.7 1.7-.7 1.4 2.4-1.3 1.3v1.4l1.3 1.3-1.4 2.4-1.7-.7-1.3.7-.4 1.8H6.6l-.4-1.8-1.3-.7-1.7.7-1.4-2.4 1.3-1.3V7.3L1.8 6l1.4-2.4 1.7.7 1.3-.7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/**
 * 智能体图标（小机器人：天线、圆角方形头部、两只眼睛），用于子智能体徽标。
 * 12px，描边跟随 currentColor。墨迹上下对称地落在 y = 1..11，几何中心就是视觉中心，
 * 与文字的对齐交给 CSS（见 .subBadge）。
 */
export function AgentIcon({ size = 12 }: { size?: number }) {
  return (
    <svg className={css.icon} width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1.8v1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="1.8" r="0.8" fill="currentColor" />
      <rect x="1.6" y="4.2" width="8.8" height="6.2" rx="2.1" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.4" cy="7.3" r="0.95" fill="currentColor" />
      <circle cx="7.6" cy="7.3" r="0.95" fill="currentColor" />
    </svg>
  )
}

export function ChevronIcon({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }) {
  const d = { up: 'M4 10l4-4 4 4', down: 'M4 6l4 4 4-4', left: 'M10 4l-4 4 4 4', right: 'M6 4l4 4-4 4' }[dir]
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.4" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="9" y1="1.6" x2="9" y2="3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${a} 9 9)`} />
      ))}
    </svg>
  )
}

export function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M11 2.6a6.6 6.6 0 1 0 4.6 9 5.2 5.2 0 0 1-4.6-9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export function SystemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 2.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" />
    </svg>
  )
}
