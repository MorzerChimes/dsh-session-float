/**
 * Minimal CDP driver for real-time checks of the harness (and later the live GUI).
 * Usage: node dev/cdp.mjs <script.json>
 * The script is a list of steps:
 *   { "goto": url } | { "wait": ms } | { "shot": path } | { "eval": js } |
 *   { "click": cssSelector } | { "drag": [x1, y1, x2, y2] } | { "mouse": [x, y] } | { "key": "Escape" } | { "viewport": [w, h] }
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const steps = JSON.parse(await readFile(process.argv[2], 'utf8'))
const port = 9300 + Math.floor(Math.random() * 400)
const profile = await mkdtemp(join(tmpdir(), 'sf-chrome-'))
const chrome = spawn('google-chrome-stable', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 50; i += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    if (targets.some((t) => t.type === 'page')) break
  } catch { /* not up yet */ }
  await sleep(100)
}
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
const logs = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`)
  }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)))
  ws.send(JSON.stringify({ id, method, params }))
})
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left', buttons, clickCount: 1 })

try {
  for (const step of steps) {
    if (step.goto) {
      await send('Page.navigate', { url: step.goto })
      await sleep(1500)
    } else if (step.viewport) {
      await send('Emulation.setDeviceMetricsOverride', { width: step.viewport[0], height: step.viewport[1], deviceScaleFactor: 1, mobile: false })
    } else if (step.wait) {
      await sleep(step.wait)
    } else if (step.shot) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(step.shot, Buffer.from(data, 'base64'))
      console.log('shot', step.shot)
    } else if (step.eval) {
      console.log('eval', JSON.stringify(await evaluate(step.eval)))
    } else if (step.click) {
      const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(step.click)}); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()`)
      if (box === null) throw new Error(`no element for ${step.click}`)
      await mouse('mouseMoved', box[0], box[1])
      await mouse('mousePressed', box[0], box[1], 1)
      await mouse('mouseReleased', box[0], box[1])
      console.log('click', step.click, box.map(Math.round))
    } else if (step.mouse) {
      await mouse('mouseMoved', step.mouse[0], step.mouse[1])
      await mouse('mousePressed', step.mouse[0], step.mouse[1], 1)
      await mouse('mouseReleased', step.mouse[0], step.mouse[1])
      console.log('mouse', step.mouse)
    } else if (step.drag) {
      const [x1, y1, x2, y2] = step.drag
      await mouse('mouseMoved', x1, y1)
      await mouse('mousePressed', x1, y1, 1)
      for (let i = 1; i <= 12; i += 1) {
        await mouse('mouseMoved', x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12, 1)
        await sleep(16)
      }
      await mouse('mouseReleased', x2, y2)
      console.log('drag', step.drag)
    } else if (step.key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, code: step.key, windowsVirtualKeyCode: step.key === 'Escape' ? 27 : 0 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code: step.key, windowsVirtualKeyCode: step.key === 'Escape' ? 27 : 0 })
    }
  }
} finally {
  for (const line of logs) console.log(line)
  ws.close()
  chrome.kill()
}
