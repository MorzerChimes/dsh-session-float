/** zh / en copy for the `sessionFloat` locale namespace. */

export const NS = 'sessionFloat'

export const zh = {
  'island.title': '活动会话',
  'activity': '活动',
  'status.pending': '待处理',
  'status.completed': '已完成',
  'status.running': '进行中',
  'pending.approval': '等待审批',
  'pending.plan-review': '计划待审',
  'pending.question': '等待回答',
  'pending.other': '等待处理',
  'detail.completed': '已完成，未查看',
  'detail.running': '运行中',
  'detail.subagents': '{n} 个子代理',
  'detail.current': '当前会话',
  'time.now': '刚刚',
  'time.minutes': '{n} 分钟前',
  'time.hours': '{n} 小时前',
  'time.days': '{n} 天前',
  'empty': '没有活动会话',
  'hint': '点击会话跳转 · 拖动顶部把手移动 · Esc 收起',
  'aria.collapsed': '活动会话 {total} 个：{parts}。点击展开',
  'aria.none': '没有活动会话。点击展开',
  'aria.open': '打开会话 {title}',
  'action.settings': '灵动岛设置',
  'action.collapse': '收起',
  'action.back': '返回会话列表',
  'action.drag': '拖动移动位置',
  'settings.title': '灵动岛设置',
  'settings.appearance': '外观',
  'settings.appearance.hint': '只影响灵动岛；「系统」跟随 DSH 当前主题',
  'settings.appearance.light': '浅色',
  'settings.appearance.dark': '深色',
  'settings.appearance.system': '系统',
  'settings.style': '收纳状态',
  'settings.style.hint': '收起时胶囊的信息详略',
  'settings.style.compact': '简略',
  'settings.style.detailed': '详细',
  'settings.outside': '点击空白处收起',
  'settings.outside.hint': '点击灵动岛以外的区域时回到收纳状态',
  'settings.position': '位置',
  'settings.position.value': '当前：{corner}，偏移 {dx}, {dy}',
  'settings.position.reset': '恢复默认',
  'corner.tl': '左上角',
  'corner.tr': '右上角',
  'corner.bl': '左下角',
  'corner.br': '右下角',
  'settings.more': '更多设置即将推出',
  'settings.storage': '设置保存在当前浏览器中，立即生效。',
} as const

export type SessionFloatKey = keyof typeof zh

export const en: Record<SessionFloatKey, string> = {
  'island.title': 'Active sessions',
  'activity': 'active',
  'status.pending': 'Pending',
  'status.completed': 'Done',
  'status.running': 'Running',
  'pending.approval': 'Awaiting approval',
  'pending.plan-review': 'Plan review',
  'pending.question': 'Awaiting answer',
  'pending.other': 'Needs attention',
  'detail.completed': 'Finished, not viewed',
  'detail.running': 'Running',
  'detail.subagents': '{n} subagents',
  'detail.current': 'Current session',
  'time.now': 'now',
  'time.minutes': '{n}m ago',
  'time.hours': '{n}h ago',
  'time.days': '{n}d ago',
  'empty': 'No active sessions',
  'hint': 'Click to open · drag the handle to move · Esc to close',
  'aria.collapsed': '{total} active sessions: {parts}. Click to expand',
  'aria.none': 'No active sessions. Click to expand',
  'aria.open': 'Open session {title}',
  'action.settings': 'Island settings',
  'action.collapse': 'Collapse',
  'action.back': 'Back to sessions',
  'action.drag': 'Drag to move',
  'settings.title': 'Island settings',
  'settings.appearance': 'Appearance',
  'settings.appearance.hint': 'Affects the island only; System follows the DSH theme',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.appearance.system': 'System',
  'settings.style': 'Collapsed style',
  'settings.style.hint': 'How much the collapsed pill shows',
  'settings.style.compact': 'Compact',
  'settings.style.detailed': 'Detailed',
  'settings.outside': 'Collapse on outside click',
  'settings.outside.hint': 'Return to the collapsed pill when clicking elsewhere',
  'settings.position': 'Position',
  'settings.position.value': 'Current: {corner}, offset {dx}, {dy}',
  'settings.position.reset': 'Reset',
  'corner.tl': 'top left',
  'corner.tr': 'top right',
  'corner.bl': 'bottom left',
  'corner.br': 'bottom right',
  'settings.more': 'More settings coming soon',
  'settings.storage': 'Saved in this browser and applied immediately.',
}

export type Translate = (key: SessionFloatKey, params?: Record<string, string | number>) => string

/**
 * Wrap the framework `t` so placeholders work whether or not the host
 * translator interpolates (unknown keys fall back to the zh copy).
 */
export function wrapT(t: ((key: string, params?: Record<string, unknown>) => string) | undefined): Translate {
  return (key, params) => {
    let text = t?.(key, params) ?? key
    if (text === key || text === `${NS}.${key}`) text = zh[key]
    if (params !== undefined) {
      text = text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
    }
    return text
  }
}

/** Relative time following the workspace browser's coarse units. */
export function relative(t: Translate, then: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000)
  if (minutes < 1) return t('time.now')
  if (minutes < 60) return t('time.minutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hours', { n: hours })
  return t('time.days', { n: Math.floor(hours / 24) })
}
