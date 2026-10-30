/**
 * Local preview harness: loads the BUILT lib/client.js through a fake
 * __ModuleLoader__ and fake DSH services, then renders the registered
 * shell.overlay entry over a mock page. Query params drive the scenario:
 *   ?scheme=light|dark  page theme      &appearance=light|dark|system
 *   &style=compact|detailed  &corner=tl|tr|bl|br  &counts=p,c,r
 *   &open=1 (click the pill)  &settings=1 (open settings)  &page=1 (render the Plugins-page form)
 *   &only=1 (onlyInConversation)  &panel=plugins|schedules (mock active main panel)
 *   &history=N (idle Sessions shown under 历史会话, default 8)
 *   &subagents=N (running subagents under the first running Session, default 3)
 *   &parentDone=1 (that parent's own turn has ended; only its subagents still run)
 */
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'

const q = new URLSearchParams(location.search)
const pageScheme = q.get('scheme') ?? 'light'
if (pageScheme === 'dark') document.body.setAttribute('data-ds-dark-theme', '')

const corner = q.get('corner') ?? 'tl'
const pos = { tl: { dx: 16, dy: 12 }, tr: { dx: 24, dy: 12 }, bl: { dx: 16, dy: 24 }, br: { dx: 24, dy: 24 } }[corner as 'tl']
localStorage.setItem('dsh-session-float:prefs', JSON.stringify({
  version: 1,
  appearance: q.get('appearance') ?? 'system',
  collapsedStyle: q.get('style') ?? 'detailed',
  collapseOnOutsideClick: true,
  onlyInConversation: q.get('only') === '1',
  position: { corner, ...pos },
}))

// 模拟 ui-layout 的 panelInfo：?panel=plugins|schedules 表示停在全局页面；window.__setPanel(id) 切换
let panelInfo = { activePanelId: q.get('panel') }
const panelListeners = new Set<() => void>()
;(window as any).__setPanel = (id: string | null) => { panelInfo = { activePanelId: id }; panelListeners.forEach((fn) => fn()) }
const usePanelInfo = (sel: (x: typeof panelInfo) => unknown) => React.useSyncExternalStore(
  (fn) => { panelListeners.add(fn); return () => { panelListeners.delete(fn) } },
  () => sel(panelInfo),
)

const [p, c, r] = (q.get('counts') ?? '1,1,2').split(',').map(Number)
const now = Date.now()
const rows: any[] = []
const statuses = new Map<string, any>()
const titles = ['重构登录模块', '修复 CI 失败用例', '分析日志性能瓶颈', '编写插件设计文档', '接口限流方案', '清理旧任务', '迁移数据库', '补充单元测试']
let n = 0
const add = (kind: string, i: number) => {
  const id = `s${n++}`
  rows.push({ id, displayTitle: titles[n % titles.length] + (n > titles.length ? ` ${n}` : ''), cwd: ['/home/u/dsh-session-float', '/home/u/my-api', '/srv/data-pipeline'][n % 3], blank: false, running: kind === 'running', updatedAt: now - (i + 1) * 4 * 60_000, retainedBy: id === 's3' ? { mainView: 1 } : {} })
  statuses.set(id, { running: kind !== 'completed', pendingInteraction: kind === 'pending' ? { kind: ['approval', 'question', 'plan-review'][i % 3] } : undefined, completionUnread: kind === 'completed' })
}
for (let i = 0; i < (p ?? 0); i++) add('pending', i)
for (let i = 0; i < (c ?? 0); i++) add('completed', i)
for (let i = 0; i < (r ?? 0); i++) add('running', i)
// 无活动状态的会话，进入「历史会话」；?history=N 控制数量，默认 8
const idleTitles = ['调研向量检索方案', '整理周报', '升级依赖版本', '排查内存泄漏', '优化首页加载', '设计权限模型', '梳理埋点需求', '重写配置解析', '评审 PR #42', '补全 API 文档']
const historyCount = Number(q.get('history') ?? 8)
for (let i = 0; i < historyCount; i++) {
  rows.push({ id: `h${i}`, displayTitle: idleTitles[i % idleTitles.length] + (i >= idleTitles.length ? ` ${i}` : ''), cwd: ['/home/u/dsh-session-float', '/home/u/my-api', '/srv/data-pipeline'][i % 3], blank: false, running: false, updatedAt: now - (i * 47 + 30) * 60_000, retainedBy: i === 0 && q.get('currentIdle') === '1' ? { mainView: 1 } : {} })
}
const list = { ids: rows.map((x) => x.id), byId: Object.fromEntries(rows.map((x) => [x.id, x])) as Record<string, any>, projectionsBySession: {} as Record<string, any> }
// ?subagents=N：给第一个进行中的会话挂 N 个运行中的子智能体（外加 1 个已结束的，不应显示），默认 3
const subCount = Number(q.get('subagents') ?? 3)
const parent = rows.find((x) => x.running)
if (parent !== undefined && subCount > 0) {
  const labels = ['分析依赖关系', '检查测试覆盖率', '整理变更说明', '审查样式改动', '调研替代方案']
  // 第一项是 DSH 兜底标题的真实样子：首条提示截到 40 字节以内，不带省略号
  const tasks = ['这是一个插件测试任务，请尽', '统计未覆盖的分支', undefined, '核对暗色主题配色', '比较三种实现的复杂度']
  const catalog: any[] = []
  for (let i = 0; i <= subCount; i++) {
    const id = `${parent.id}-sub${i}`
    const running = i < subCount
    catalog.push({ id, createdAt: now - i * 1000, mode: i % 2 === 0 ? 'one-shot' : 'continuable', ...(i === 2 ? {} : { label: labels[i % labels.length] }) })
    list.byId[id] = {
      id, displayTitle: tasks[i % tasks.length] ?? `子会话 ${i}`, origin: 'subagent', parentId: parent.id, blank: false, running, updatedAt: 0,
      projectionValues: {
        ...(tasks[i % tasks.length] === undefined ? {} : { title: tasks[i % tasks.length] }),
        subagentTiming: { settledMs: i * 95_000, ...(running ? { active: { since: now - (i + 1) * 17_000, through: now } } : {}) },
        ...(i === 1 ? {} : { tokenUsage: { uncachedInputTokens: 1200 * (i + 1), outputTokens: 800 * (i + 1), cacheReadTokens: 9000 * (i + 1) ** 2, cacheWriteTokens: 300 } }),
      },
    }
    statuses.set(id, { running, pendingInteraction: undefined, completionUnread: false })
  }
  list.projectionsBySession[parent.id] = { values: { subagentCatalog: catalog }, state: 'idle', error: null }
  // ?parentDone=1：父会话本轮已结束（未读完成），只剩子智能体在运行；应仍归入进行中
  if (q.get('parentDone') === '1') {
    parent.running = false
    statuses.set(parent.id, { running: false, pendingInteraction: undefined, completionUnread: true })
  }
}
const workspaces = { items: [{ title: 'dsh-session-float', sessionIds: ['s0', 's3'] }], archivedSessionIds: [] }
const hook = (v: unknown) => (sel: (x: unknown) => unknown) => sel(v)

const registered: Record<string, { options: any; Component: any }> = {}
const dicts: Record<string, Record<string, string>> = {}
const fakeCtx: any = {
  slots: {
    inject: (_name: string, fn: () => unknown) => { fn() },
    register: (options: any, Component: any) => { registered[options.name] = { options, Component }; return () => {} },
  },
  locale: { register: (_ns: string, loc: string, d: Record<string, string>) => { dicts[loc] = d; return () => {} } },
  effect: (fn: () => unknown) => { fn() },
  on: () => () => {},
  get: (name: string) => name === 'uiWorkspace'
    ? { openSession: (id: string) => { document.title = `opened:${id}`; console.log('openSession', id) } }
    : name === 'theme' ? { getTheme: () => ({ active: { colorScheme: pageScheme } }) } : undefined,
}

let entry: any
;(window as any).__ModuleLoader__ = { load: (e: any) => { entry = e } }
const script = document.createElement('script')
script.src = '../lib/client.js'
script.onload = () => {
  const mod = entry.factory((id: string) => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return jsx
    throw new Error(`unknown module ${id}`)
  })
  mod.apply(fakeCtx)
  const lang = q.get('lang') ?? 'zh'
  const t = (key: string, params?: Record<string, unknown>) => {
    const text = dicts[lang]?.[key] ?? key
    return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text
  }
  const overlay = registered['shell.overlay']!
  const config = registered['plugins.bundle.config']!
  const App = () => q.get('page') === '1'
    ? jsx.jsx('div', { className: 'pluginPage', children: [jsx.jsx('h2', { children: '活动会话灵动岛' }), jsx.jsx(config.Component, { ...config.options.inject(), view: 'page', t })] })
    : jsx.jsx(overlay.Component, { ...overlay.options.inject(), useSessions: hook(list), useSessionStatus: hook(statuses), useWorkspaces: hook(workspaces), usePanelInfo, t })
  createRoot(document.getElementById('overlay')!).render(jsx.jsx(App, {}))
  if (q.get('open') === '1') setTimeout(() => (document.querySelector('[aria-expanded]') as HTMLElement)?.click(), 200)
  if (q.get('settings') === '1') setTimeout(() => (document.querySelector('[aria-label="灵动岛设置"]') as HTMLElement)?.click(), 900)
}
document.head.appendChild(script)
