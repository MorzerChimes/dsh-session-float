/**
 * Local preview harness: loads the BUILT lib/client.js through a fake
 * __ModuleLoader__ and fake DSH services, then renders the registered
 * shell.overlay entry over a mock page. Query params drive the scenario:
 *   ?scheme=light|dark  page theme      &appearance=light|dark|system
 *   &style=compact|detailed  &corner=tl|tr|bl|br  &counts=p,c,r
 *   &open=1 (click the pill)  &settings=1 (open settings)  &page=1 (render the Plugins-page form)
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
  position: { corner, ...pos },
}))

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
rows.push({ id: 'idle', displayTitle: 'idle', blank: false, running: false, updatedAt: 0 })
const list = { ids: rows.map((x) => x.id), byId: Object.fromEntries(rows.map((x) => [x.id, x])), projectionsBySession: {} }
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
    : jsx.jsx(overlay.Component, { ...overlay.options.inject(), useSessions: hook(list), useSessionStatus: hook(statuses), useWorkspaces: hook(workspaces), t })
  createRoot(document.getElementById('overlay')!).render(jsx.jsx(App, {}))
  if (q.get('open') === '1') setTimeout(() => (document.querySelector('[aria-expanded]') as HTMLElement)?.click(), 200)
  if (q.get('settings') === '1') setTimeout(() => (document.querySelector('[aria-label="灵动岛设置"]') as HTMLElement)?.click(), 900)
}
document.head.appendChild(script)
