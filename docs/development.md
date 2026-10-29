# 开发指南

本文面向修改 dsh-session-float 代码的开发者。功能介绍和安装方式见仓库根目录的 [README](../README.md)，设计方案见 [design/README.md](design/README.md)。

## 环境要求

- Node.js 20 及以上（当前在 24 上开发）
- 已安装 DeepSeek Harness `0.2.1-rc.2` 及以上，并能运行 `dsh web`
- 本地预览和截图需要 Google Chrome（`google-chrome-stable`）

## 常用命令

```sh
npm install          # 安装开发依赖
npm run build        # 打包浏览器半侧，生成 lib/client.js
npm test             # 运行单元测试（vitest）
npm run typecheck    # TypeScript 类型检查
npm run check        # 依次运行类型检查、单元测试、构建，提交前必跑
```

## 在本机 DSH 中调试

把本地目录以 `link:` 方式装进 web profile：

```sh
dsh plugin --profile web add link:$(pwd)
```

之后每次修改代码，运行 `npm run build`，再刷新 DSH 页面即可看到效果。profile 启用了 HMR（`patchReload: live`）时无需重启 `dsh web`；否则需要重启。

## 目录结构

```
dsh-session-float/
├─ AGENTS.md               # 给 AI 编程助手的项目约定
├─ README.md               # 仓库主页：功能、安装、预览、更新记录
├─ CHANGELOG.md            # 完整更新记录
├─ package.json            # dsh.client / dsh.bundle 声明
├─ cordis.patch.yml        # 组合包 patch：插入 session-float 这一行
├─ lib/
│  ├─ index.js             # Host 半侧：空 apply()
│  └─ client.js            # 浏览器半侧构建产物（需要提交）
├─ scripts/build.mjs       # esbuild 打包脚本
├─ src/client/
│  ├─ index.tsx            # 入口：注册 shell.overlay 与 plugins.bundle.config
│  ├─ Island.tsx           # 灵动岛：定位、拖动、展开收起、动画
│  ├─ SettingsForm.tsx     # 设置表单（岛内与插件页共用）
│  ├─ icons.tsx            # 状态图标与简略模式徽标
│  ├─ classify.ts          # 纯函数：会话归类、排序、计数
│  ├─ placement.ts         # 纯函数：锚定角、偏移换算、夹紧
│  ├─ prefs.ts             # 设置存储（localStorage）
│  ├─ theme.ts             # 外观解析
│  ├─ locales.ts           # 中英文文案
│  └─ island.module.css    # 样式
├─ test/                   # 单元测试
├─ dev/                    # 本地预览与浏览器自动化工具
└─ docs/                   # 所有文档
```

## 构建说明

`scripts/build.mjs` 把 `src/client/index.tsx` 打包成 DSH 客户端模块格式：

```js
window.__ModuleLoader__.load({ id: "dsh-session-float", factory: (require) => { ... } })
```

- React、`@deepseek-ai/cordis` 等 Web 外壳共享模块（`PLATFORM_MODULES`）保持 external，插件使用页面上的同一份实例。Motion 打进包内。
- 如果产物引用了共享表以外的模块，构建会直接失败，避免页面出现第二份 React 或加载不到依赖。
- `*.module.css` 的类名会加上 `sf_` 前缀，样式在模块物化时注入 `<style data-plugin="dsh-session-float">`，停用插件时由 DSH 回收。

`lib/client.js` 必须提交到仓库：从 git 地址安装时 DSH 只读取已构建的文件，不会在安装时构建。

## 测试

纯函数模块（`classify.ts`、`placement.ts`、`prefs.ts`、`theme.ts`）的单元测试在 `test/` 下。修改归类规则、位置换算或设置格式时，先补测试再改代码。

## 本地预览

`dev/` 下的工具可以在不启动 DSH 的情况下检查界面：

- `dev/index.html` + `dev/harness.tsx`：用伪造的 `__ModuleLoader__` 和 DSH 服务加载**构建后的** `lib/client.js`，渲染在模拟页面上。
- `dev/cdp.mjs`：通过 Chrome DevTools Protocol 在真实时间下点击、拖动、按键和截图。无头 Chrome 的虚拟时间会冻结动画，所以要用它而不是 `--screenshot`。

```sh
npx esbuild dev/harness.tsx --bundle --format=iife --jsx=automatic \
  --outfile=dev/harness.js --define:process.env.NODE_ENV='"production"'
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:8765/dev/index.html`。URL 参数：

| 参数 | 取值 | 说明 |
|---|---|---|
| `counts` | `p,c,r` | 待处理、已完成、进行中的会话数，默认 `1,1,2` |
| `style` | `detailed` / `compact` | 收纳状态 |
| `appearance` | `light` / `dark` / `system` | 外观设置 |
| `scheme` | `light` / `dark` | 模拟的 DSH 页面主题 |
| `corner` | `tl` / `tr` / `bl` / `br` | 初始锚定角 |
| `open` | `1` | 加载后自动展开 |
| `settings` | `1` | 展开后进入设置页 |
| `page` | `1` | 渲染插件页中的设置表单 |
| `lang` | `zh` / `en` | 界面语言 |
| `only` | `1` | 开启「仅在会话页中显示」 |
| `panel` | `plugins` / `schedules` | 模拟当前停在全局页面；页面中可调用 `__setPanel(id)` 切换，`null` 为会话页 |

`dev/cdp.mjs` 读取一个 JSON 步骤列表：

```sh
node dev/cdp.mjs steps.json
```

```json
[
  { "goto": "http://127.0.0.1:8765/dev/index.html?counts=1,1,2" },
  { "click": "[aria-expanded]" },
  { "wait": 900 },
  { "shot": "/tmp/expanded.png" },
  { "drag": [100, 30, 1200, 40] },
  { "key": "Escape" },
  { "eval": "localStorage.getItem('dsh-session-float:prefs')" }
]
```

## 依赖的 DSH 接口

| 接口 | 提供方 | 用途 |
|---|---|---|
| `shell.overlay` slot | ui-layout | 挂载灵动岛 |
| `plugins.bundle.config` slot | ui-plugin-manager | 插件页中的设置表单 |
| `useSessions` | ui-session | 会话列表 |
| `useSessionStatus` | ui-session | 运行、待处理、未读完成状态 |
| `useWorkspaces` | ui-workspace | Workspace 名称与归档集合 |
| `usePanelInfo` | ui-layout | 当前主面板，判断是否在会话页 |
| `ctx.uiWorkspace.openSession` | ui-workspace | 跳转到会话 |
| `ctx.theme` / `theme/change` | ui-theme | 外观"系统"模式跟随 DSH |
| `ctx.locale.register` | client-locale | 中英文文案 |

这些接口来自 DSH `0.2.1-rc.2`，升级 DSH 后需要回归检查。
