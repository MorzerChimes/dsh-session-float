/**
 * Island placement math: corner anchoring, conversion between absolute
 * coordinates and corner offsets, clamping, and the expanded panel budget.
 * Pure functions; the DOM layer only measures and applies the results.
 */

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

/** Distance from the anchored corner's two edges, in CSS px. */
export interface Position {
  readonly corner: Corner
  readonly dx: number
  readonly dy: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const DEFAULT_POSITION: Position = { corner: 'tl', dx: 16, dy: 12 }
/** Minimum gap kept between the island and the viewport edges. */
export const EDGE_MARGIN = 8
/** Pointer travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 4

export function isRight(corner: Corner): boolean {
  return corner === 'tr' || corner === 'br'
}

export function isBottom(corner: Corner): boolean {
  return corner === 'bl' || corner === 'br'
}

/** CSS `transform-origin` matching the anchored corner. */
export function transformOrigin(corner: Corner): string {
  return `${isBottom(corner) ? 'bottom' : 'top'} ${isRight(corner) ? 'right' : 'left'}`
}

/** Inline CSS offsets that pin the element to its anchored corner. */
export function anchorStyle(position: Position): Record<'left' | 'right' | 'top' | 'bottom', number | 'auto'> {
  return {
    left: isRight(position.corner) ? 'auto' : position.dx,
    right: isRight(position.corner) ? position.dx : 'auto',
    top: isBottom(position.corner) ? 'auto' : position.dy,
    bottom: isBottom(position.corner) ? position.dy : 'auto',
  }
}

/** Clamp an absolute rect into the viewport, keeping {@link EDGE_MARGIN}. */
export function clampRect(rect: Rect, viewport: Size, margin = EDGE_MARGIN): Rect {
  const maxLeft = Math.max(margin, viewport.width - rect.width - margin)
  const maxTop = Math.max(margin, viewport.height - rect.height - margin)
  return {
    ...rect,
    left: Math.min(Math.max(rect.left, margin), maxLeft),
    top: Math.min(Math.max(rect.top, margin), maxTop),
  }
}

/** Choose the corner by which viewport half holds the rect's center. */
export function cornerFor(rect: Rect, viewport: Size): Corner {
  const right = rect.left + rect.width / 2 > viewport.width / 2
  const bottom = rect.top + rect.height / 2 > viewport.height / 2
  return right ? (bottom ? 'br' : 'tr') : (bottom ? 'bl' : 'tl')
}

/** Convert a clamped absolute rect into a corner-anchored position without moving it. */
export function positionFromRect(rect: Rect, viewport: Size): Position {
  const clamped = clampRect(rect, viewport)
  const corner = cornerFor(clamped, viewport)
  const dx = isRight(corner) ? viewport.width - clamped.left - clamped.width : clamped.left
  const dy = isBottom(corner) ? viewport.height - clamped.top - clamped.height : clamped.top
  return { corner, dx: Math.round(dx), dy: Math.round(dy) }
}

/** Absolute rect of an element of `size` placed at `position`. */
export function rectFromPosition(position: Position, size: Size, viewport: Size): Rect {
  const left = isRight(position.corner) ? viewport.width - position.dx - size.width : position.dx
  const top = isBottom(position.corner) ? viewport.height - position.dy - size.height : position.dy
  return { left, top, width: size.width, height: size.height }
}

/**
 * Keep a stored position valid for the current viewport: offsets never go
 * below the margin, and the collapsed size still fits.
 */
export function clampPosition(position: Position, size: Size, viewport: Size): Position {
  const maxDx = Math.max(EDGE_MARGIN, viewport.width - size.width - EDGE_MARGIN)
  const maxDy = Math.max(EDGE_MARGIN, viewport.height - size.height - EDGE_MARGIN)
  const dx = Math.min(Math.max(position.dx, EDGE_MARGIN), maxDx)
  const dy = Math.min(Math.max(position.dy, EDGE_MARGIN), maxDy)
  return dx === position.dx && dy === position.dy ? position : { corner: position.corner, dx, dy }
}

/** Space the expanded panel may occupy when growing away from its corner. */
export function panelBudget(position: Position, viewport: Size): Size {
  return {
    width: Math.max(0, viewport.width - position.dx - EDGE_MARGIN),
    height: Math.max(0, viewport.height - position.dy - EDGE_MARGIN),
  }
}

export function samePosition(a: Position, b: Position): boolean {
  return a.corner === b.corner && a.dx === b.dx && a.dy === b.dy
}

export function isCorner(value: unknown): value is Corner {
  return value === 'tl' || value === 'tr' || value === 'bl' || value === 'br'
}
