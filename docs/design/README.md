# dsh-session-float 设计

DSH Web GUI 的浮动"灵动岛"插件。收纳态显示活动会话统计，展开后列出会话详情，点击即可跳转；外观、收纳样式和收起方式可在设置中调整。

基于 DSH `0.2.1-rc.2`。本文引用的接口来自已安装包的类型声明与 README，标注"待验证"的条目在 M1 中确认。

## 1. 需求

| 需求 | 设计决定 | 详见 |
|---|---|---|
| 默认在页面左上角显示 | 挂在 `shell.overlay` 浮层，初始位置左上角偏移 `16, 12` | §3、§9 问题 1 |
| 用户可移动位置 | Pointer 拖动，松手后夹紧到视口内，以"锚定角 + 偏移"保存 | §5.3 |
| 收纳态显示活动总数及各状态数量 | 三类互斥，总数等于三者之和；数量为 0 的状态不显示 | §4、§5.1 |
| 收纳态分详细、简略两种 | 详细：图标 + 数字 + 文字；简略：数字写在状态图标中心 | §5.1、§6.2 |
| 点击展开，显示活动会话详情 | 同一元素原地变形为面板 | §5.2 |
| 排序：待处理 → 已完成 → 进行中 | 组顺序固定，组内按 `updatedAt` 倒序，空组不显示 | §4 |
| 点击会话跳转 | `ctx.uiWorkspace.openSession(id)`，随后收起 | §3 |
| 靠左时向右展开、向左收拢，靠右时反之 | 由所在半屏决定锚定角，展开与收拢都以该角为原点 | §5.4 |
| 设置页面 | 岛内设置页 + 插件页中本插件的配置区，两处共用一份表单 | §8 |
| 外观：浅色 / 深色 / 系统 | 深色比 DSH 深色亮一级；系统跟随 DSH 当前主题 | §6.1 |
| 活动总数使用 DSH 主题色 | 使用 DSH `brand-primary`（浅色下为黑色），不再用橙色 | §6.1 |
| 点击时有充分的过渡动画 | 使用 Motion（React 动画库）的 layout 动画与弹簧 | §7 |
| 点击空白处收起（可开关） | 默认开启；关闭后只能通过按钮、Esc 或点击会话收起 | §5.5 |
| 仅在会话页中显示（可开关） | 默认关闭；开启后在插件、自动化任务等全局页面中隐藏 | §5.6 |

## 2. 插件形态

纯浏览器插件：Host 侧只有空的 `apply()`，不读写模型请求，对 KV Cache 无影响。

```
dsh-session-float/
├─ package.json            # dsh.client + dsh.bundle 声明
├─ cordis.patch.yml        # insert: { id: session-float, name: dsh-session-float }
├─ scripts/build.mjs       # esbuild 打包浏览器半侧
├─ lib/index.js            # Host 侧空 apply()，让 Loader 能找到浏览器包
├─ lib/client.js           # 构建产物：window.__ModuleLoader__.load({ id, factory })
└─ src/client/
   ├─ index.ts             # inject / apply：注册 locale、shell.overlay、plugins.bundle.config
   ├─ classify.ts          # 纯函数：会话归类、排序、计数
   ├─ placement.ts         # 纯函数：锚定角、偏移换算、夹紧、面板最大尺寸
   ├─ prefs.ts             # 偏好存储（localStorage + 订阅）
   ├─ theme.ts             # 外观解析：light / dark / system → light | dark
   ├─ Island.tsx           # 根容器：定位、展开状态、动画编排
   ├─ Collapsed.tsx        # 收纳态：详细 / 简略
   ├─ SessionList.tsx      # 展开态：会话列表
   ├─ SettingsForm.tsx     # 设置表单，岛内和插件页共用
   ├─ useDrag.ts           # 拖动、阈值、松手换算
   ├─ locales.ts           # zh / en 文案
   └─ island.module.css    # 岛体样式与 --sf-* 变量
```

`package.json` 关键字段：

```jsonc
{
  "name": "dsh-session-float",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./package.json": "./package.json" },
  "dependencies": { "motion": "<M1 锁定版本>" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-session",
        "@deepseek-ai/dsh-client-ui-workspace",
        "@deepseek-ai/dsh-client-ui-theme",
        "@deepseek-ai/dsh-client-ui-plugin-manager",
        "@deepseek-ai/dsh-client-locale"
      ]
    }
  },
  "peerDependencies": { "@deepseek-ai/cordis": "~4.0.5" },
  "engines": { "dsh": ">=0.2.1-rc.2" }
}
```

`dsh.client.inject` 只影响加载与预取顺序，不保证 apply 顺序，所以每个注册都通过 `ctx.slots.inject(slotName, ...)` 等待对应 slot 声明出现，做法与 ui-schedule、ui-workspace 一致。

**构建**：React、`react/jsx-runtime`、`@deepseek-ai/cordis`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-store` 都在 Web 外壳的共享模块表（`PLATFORM_MODULES`）中，打包时全部 external，否则页面上会出现第二份 React。Motion 不在共享表中，需要打进 `lib/client.js`，它对 `react` 的引用同样解析到共享表。esbuild 输出 CJS 片段，再包进 `__ModuleLoader__.load({ id: "dsh-session-float", factory: (require) => {...} })`，格式与官方 `dsh-client-ui-deepseek-model-label-1017/lib/client.js` 相同。CSS 在 factory 内注入 `<style data-plugin="dsh-session-float">`，停用插件时由模块系统回收。

## 3. 挂载与数据来源

```ts
export const inject = ['slots', 'locale', 'uiWorkspace', 'theme']

export function apply(ctx: Context) {
  const prefs = createPrefsStore()               // §8.2
  const scheme = createSchemeSource(ctx, prefs)  // §6.1，输出 'light' | 'dark'
  ctx.effect(() => ctx.locale.register('sessionFloat', { zh, en }))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'session-float.island',
    locale: 'sessionFloat',
    inject: () => ({
      openSession: (id: SessionId) => ctx.uiWorkspace.openSession(id),
      hooks: { prefs, scheme },                  // 渲染器绑定为 usePrefs / useScheme
    }),
  }, Island))

  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'dsh-session-float',                    // 键为本包包名
    locale: 'sessionFloat',
    inject: () => ({ hooks: { prefs, scheme } }),
  }, BundleSettings))                            // 只渲染 view === 'page'
}
```

**`shell.overlay`**：ui-layout 定义的整框架通用浮层（list slot，root 作用域），位于所有栏之上、滚动容器之外，文档写明"badge、toast、status pill 都属于这里"。浮层本身点击穿透，条目自行设置 `pointer-events: auto`，因此不会挡住下面的界面。切换主面板时它保持挂载。

**`plugins.bundle.config`**：插件管理页（侧栏"插件"）声明的 keyed slot，以组合包包名为键，渲染在该组合包详情页的描述与组件列表之间。没有插件管理页的组合里，这个注册不会发生，岛内设置页照常可用。

**`openSession`**：ui-workspace 的实现会先 retain 会话、更新选择，再调用 `ctx.layout.selectPanel(null)` 切回会话界面。所以即使用户当前停在设置或插件页，点击会话行也能直接跳到会话。

**组件拿到的全局数据**（root 作用域的 GlobalStandardProps，由渲染器绑定成 selector hook）：

| Hook | 提供方 | 用途 |
|---|---|---|
| `useSessions` | ui-session | `ids`、`byId[id]`（`displayTitle`、`cwd`、`origin`、`blank`、`running`、`updatedAt`） |
| `useSessionStatus` | ui-session | `Map<SessionId, { running, pendingInteraction, completionUnread }>` |
| `useWorkspaces` | ui-workspace | 归档集合 `archivedSessionIds`、Workspace 名称 |
| `usePanelInfo` | ui-layout | `activePanelId` 为 null 时是会话界面；用于「仅在会话页中显示」 |

待验证：`shell.overlay` 条目能收到这些全局 props，`inject` 返回的 `hooks` 会按 `useXxx` 绑定（类型声明和 ui-workspace、ui-schedule 的 overlay 条目都是这种用法）。

## 4. 会话归类规则

规则与侧边栏 ui-workspace 的状态点一致，保证两处显示不矛盾。每个会话只归入一组，按优先级判断：

1. **待处理**：`status.pendingInteraction !== undefined`，即审批、计划待审或提问。副标题显示类型（"等待审批""计划待审""等待回答"）。
2. **已完成**：`status.completionUnread === true`，即运行结束且用户还没打开查看。
3. **进行中**：`(status.running ?? summary.running) === true`。副标题附加运行中的子代理数（来自 `projectionsBySession[id].values.subagentCatalog`）。

不计入：`origin === 'subagent'` 的会话（侧边栏也隐藏它们）、已归档会话、空白会话（`blank`）。

活动总数等于三组之和。`classify(list, statuses, archived)` 返回 `{ total, groups: [{ kind, sessions }] }`，`groups` 已按固定顺序排列并去掉空组；收纳态和展开态都只读这个结果，所以"数量为 0 的状态不显示"在两处的口径一致。

> "已完成"的语义：`completionUnread` 是浏览器进程内的状态。用户在主视图打开该会话后清除，刷新页面后也会丢失；用户正在查看的会话结束运行时不会进入"已完成"。它适合"提醒我去看"，不等于"今天完成过的所有会话"。

## 5. 交互设计

效果图在 `docs/design/mockups/`，由 `gen.py` 生成 SVG，再用 `rsvg-convert` 导出 PNG。

| 文件 | 内容 |
|---|---|
| [01-collapsed.png](mockups/01-collapsed.png) | 收纳态（详细）在页面上的样子 |
| [02-expanded.png](mockups/02-expanded.png) | 展开态会话列表 |
| [03-collapsed-variants.png](mockups/03-collapsed-variants.png) | 详细 / 简略 × 浅色 / 深色，各种数量组合 |
| [04-appearance.png](mockups/04-appearance.png) | 外观三种模式 |
| [05-direction.png](mockups/05-direction.png) | 按锚定角决定展开方向 |
| [06-settings.png](mockups/06-settings.png) | 岛内设置页与插件页配置区 |
| [07-motion.png](mockups/07-motion.png) | 展开、收起、计数变化的动画分镜 |

### 5.1 收纳态

胶囊高 36px，内容从左到右是"活动总数"段和各状态段，状态段按待处理、已完成、进行中排列。

- **详细**：`● 4 活动 │ ! 1 待处理  ✓ 1 已完成  ◌ 2 进行中`。活动段的圆点和数字用 DSH 主题色。
- **简略**：每段只有一个 22px 的圆形图标，数字写在图标中心。活动为主题色实心圆；待处理、已完成为对应颜色的实心圆，右上或右下带一个小角标（`!` / `✓`），保证不依赖颜色也能区分；进行中为环形进度图标，数字写在环内，环缓慢旋转。数字超过 99 时显示 `99+`。
- **隐藏 0**：数量为 0 的状态段不渲染。例如没有待处理时显示 `活动 │ 已完成 进行中`。活动段始终保留；总数为 0 时只剩 `0 活动`，并把不透明度降到 0.6，分隔线随之消失。
- 段的出现和消失带宽度动画（§7），胶囊宽度平滑变化，并朝锚定角收拢。
- 单击展开；按住拖动移动（§5.3）。

### 5.2 展开态

面板宽 380px，最大高度受可用空间限制（§5.4），超出后内部滚动。

- 头部：拖动把手、标题"活动会话"和总数、设置按钮（齿轮）、收起按钮。
- 列表：按 §4 的分组顺序显示，空组不显示。每行有状态图标、标题、Workspace 名与状态说明、相对时间；当前打开的会话带竖条标记。
- 点击行：调用 `openSession(id)`，然后收起。
- 齿轮切换到岛内设置页（§8.1），返回箭头回到列表。两页之间横向滑动切换，面板高度同步过渡。
- Esc 始终可以收起；点击空白处是否收起由设置决定（§5.5）。

### 5.3 拖动与位置

- `pointerdown` 后位移超过 4px 才进入拖动，否则视为点击，避免误触展开。
- 拖动中调用 `setPointerCapture`，阴影加深，元素用 `left/top` 跟随指针。
- 松手时：先夹紧到视口内并保留 8px 边距，再根据岛的中心点落在哪个半屏算出锚定角（`tl` / `tr` / `bl` / `br`），把位置换算成"锚定角 + 到该角两条边的距离"保存，例如 `{ corner: 'tr', dx: 40, dy: 12 }`。换算前后视觉位置不变，不会跳动。
- 渲染时按锚定角选择 CSS 定位边：`tl` 用 `left/top`，`tr` 用 `right/top`，依此类推。窗口缩放时岛贴着原来的角，`resize` 时重新夹紧。
- 展开态只能用头部把手拖动，避免和列表点击冲突。拖过中线后锚定角改变，面板会以动画移到新的展开方向。
- macOS 桌面端左上角有红绿灯和 `shell.leading` 控件，夹紧时额外避开 `--dsh-frame-leading-clearance`（只在桌面端出现）。
- 设置页的"恢复默认"把位置重置为 `{ corner: 'tl', dx: 16, dy: 12 }`。

### 5.4 展开与收拢方向

锚定角同时决定展开方向，见 [05-direction.png](mockups/05-direction.png)：

| 锚定角 | 固定点 | 展开方向 | 收起时 |
|---|---|---|---|
| `tl` | 左上角 | 向右、向下 | 缩回左上角 |
| `tr` | 右上角 | 向左、向下 | 缩回右上角 |
| `bl` | 左下角 | 向右、向上 | 缩回左下角 |
| `br` | 右下角 | 向左、向上 | 缩回右下角 |

岛从锚定的两条边定位，所以尺寸变大时自然朝远离锚定角的方向生长；`transform-origin` 设为同一个角，缩放类动画也以它为原点。收纳态因计数变化而变宽或变窄时也遵循同一规则，所以右侧的岛会向右收拢。

面板最大尺寸由 `placement.ts` 计算：`maxHeight = 视口高度 − dy − 8`，`maxWidth = 视口宽度 − dx − 8`。视口宽度小于 420px 时面板改为全宽。

### 5.5 点击空白处收起

- 设置项"点击空白处收起"，默认开启。
- 开启时，展开期间在 `document` 上以捕获阶段监听 `pointerdown`。事件路径（`composedPath()`）不包含岛根节点时收起。
- 不调用 `preventDefault`，这次点击照常作用到页面上的目标。用户点侧边栏某个按钮时，岛收起，按钮也同时生效，不需要多点一次。
- 从岛上开始的拖动、岛内的滚动和文字选择不会触发收起。
- 关闭时，只有收起按钮、Esc、点击会话行这三种方式会收起。

### 5.6 仅在会话页中显示

- 设置项"仅在会话页中显示"，默认关闭。
- 开启后，读取 ui-layout 的 `usePanelInfo`：`activePanelId` 为 `null` 表示主面板是会话页，灵动岛照常显示；为其他值（如 `plugins`、`schedules`）时不渲染灵动岛。
- 隐藏时整个岛卸载，展开状态不保留；回到会话页后以收纳态重新出现，位置不变。
- 拿不到 `usePanelInfo`（没有 ui-layout）时按会话页处理，始终显示。
- 判断逻辑是 `prefs.ts` 中的纯函数 `isIslandVisible()`，有单元测试。

### 5.7 其他行为

- **新的待处理到达**：待处理段轻微放大一次（约 260ms）。不自动展开，不抢焦点。
- **无障碍**：胶囊是 `button`，带 `aria-expanded`，`aria-label` 读出完整计数（简略模式同样读完整文字）；面板是 `role="dialog"`，会话行是按钮；计数变化通过 `aria-live="polite"` 播报；键盘可完成所有操作。

## 6. 视觉规范

### 6.1 外观与配色

外观设置有三个选项，只影响岛本身，不改 DSH 页面：

- **浅色**：白底、细描边、柔和阴影。
- **深色**：岛体 `#3A3B40`。DSH 深色的背景层是 `#151517`（bg-base）、`#232324`（layer-1）、`#2C2C2E`（layer-2）、`#353638`（layer-3），岛体比最高的 layer-3 还亮一级，再加 12% 白色描边，在 DSH 深色页面上也能看清边界。
- **系统**（默认）：跟随 DSH 当前主题。读取 `ctx.theme.getTheme().active.colorScheme`，并订阅 `theme/change` 事件；DSH 主题为 `system` 时，ui-theme 已经替我们解析好操作系统配色。切换时颜色过渡 150ms。

`theme.ts` 把偏好与 DSH 快照合成为 `'light' | 'dark'`，写到岛根节点的 `data-sf-scheme` 属性上。CSS 按该属性切换一组 `--sf-*` 变量。岛的配色可能与页面不同（例如浅色页面上的深色岛），所以不能直接使用随页面变化的 `--dsw-alias-*`。DSH 的品牌色和状态色改为引用不随主题变化的 `--dsw-static-*` 色板，并写上回退值。

| 变量 | 用途 | 浅色岛 | 深色岛 |
|---|---|---|---|
| `--sf-bg` | 岛体 | `#FFFFFF` | `#3A3B40` |
| `--sf-border` | 描边 | `rgba(15,17,21,.10)` | `rgba(255,255,255,.12)` |
| `--sf-fg` / `--sf-fg-2` | 主 / 次文字 | `#0F1115` / `#61666B` | `#F9FAFB` / `#B4B7BD` |
| `--sf-hover` | 行悬停 | `#F2F3F5` | `#46474D` |
| `--sf-activity` | 活动（DSH `brand-primary`） | `neutral-bluish-1000` `#0F1115` | `neutral-bluish-50` `#F9FAFB` |
| `--sf-running` | 进行中（DSH `state-business-primary`） | `deepseek-500` `#4176E6` | `deepseek-400` `#7AAAFF` |
| `--sf-pending` | 待处理 | `#FF9500` | `#FF9F0A` |
| `--sf-completed` | 已完成 | `#34C759` | `#30D158` |

活动色取自 DSH 的 `brand-primary`：浅色下为黑色，深色下为近白色。它和三种状态色都不重合。浅色、深色分别取哪一档静态色值，在 M1 中对照运行中的页面确认。

### 6.2 收纳态尺寸

| 项 | 详细 | 简略 |
|---|---|---|
| 高度 / 圆角 | 36 / 18 | 36 / 18 |
| 段内容 | 12px 图标 + 数字（13.5px 粗体）+ 文字（12px） | 22px 圆形图标，数字（11px 粗体，`99+` 时 8.5px）居中 |
| 段间距 | 12px | 8px |
| 活动段与状态段 | 1px 分隔线，两侧各 11px | 1px 分隔线，两侧各 6px |
| 内边距 | 左右 14px | 左右 7px |

## 7. 过渡动画

### 7.1 方案选择

| 方案 | 适配 React 的挂载 / 卸载 | 尺寸变形（胶囊 → 面板） | 可打断 | 说明 |
|---|---|---|---|---|
| **Motion**（原 Framer Motion） | `AnimatePresence` 原生支持退出动画 | `layout` 属性自动做 FLIP | 是，从当前值继续 | 声明式，和组件写在一起 |
| GSAP | 需要手动管理 ref 和卸载时机 | 需要 Flip 插件和手动快照 | 是 | 能力强；自 3.13 起全部插件免费（[CSS-Tricks](https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/)），但在 React 中写法偏命令式 |
| anime.js v4 | 需要手动处理 | 有 layout 模块 | 是 | 与 React 集成需要自己封装 |
| 纯 CSS | 退出动画难做 | `height: auto` 过渡依赖较新的浏览器特性 | 部分 | 无依赖，但做不到灵动岛式的弹性变形 |

选用 **Motion**（`motion/react`）。这里的核心需求包括：胶囊和面板之间的尺寸、圆角变形，状态段和列表行的进出场（"数量为 0 的状态不显示"会频繁触发卸载），以及展开途中再次点击能平滑反向。Motion 的 `layout`、`AnimatePresence` 和弹簧动画正好覆盖这些，代码量最少。

体积控制：使用 `LazyMotion` + `m` 组件，只加载 layout 动画需要的特性包（[Motion：减小包体积](https://motion.dev/docs/react-reduce-bundle-size)）。M1 用 esbuild metafile 实测加入 Motion 后 `lib/client.js` 的体积。如果体积不可接受，退路是改用 GSAP + Flip，交互设计不变。

### 7.2 动画编排

分镜见 [07-motion.png](mockups/07-motion.png)。参数为初值，实现时再调。

| 场景 | 动作 | 参数 |
|---|---|---|
| 按下胶囊 | 缩小到 0.97 | 80ms |
| 展开 | 胶囊内容淡出并轻微模糊 → 容器宽、高、圆角弹簧变形 → 列表行依次淡入上移 | 内容退出 100ms；容器 `spring { stiffness: 420, damping: 34, mass: 0.9 }`，约 400ms 稳定，圆角 18 → 22；行间隔 30ms，`y: 6 → 0` |
| 收起 | 列表内容先快速淡出 → 容器朝锚定角收回 → 胶囊内容淡入 | 内容退出 100ms；容器使用同一组弹簧；内容进入 180ms |
| 列表 ↔ 设置 | 内容横向交叉滑动 ±24px 并淡入淡出，容器高度 layout 过渡 | 180ms |
| 状态段出现 / 消失 | 宽度与透明度过渡，胶囊整体宽度跟随 | `layout` + `AnimatePresence` |
| 数字变化 | 旧数字上移淡出，新数字从下方进入 | 160ms |
| 新待处理到达 | 待处理段 `scale 1 → 1.06 → 1` | 260ms |
| 进行中图标 | 环形图标匀速旋转 | 1.2s 一圈 |
| 拖动松手 | 夹紧或换锚定角时位置弹回 | 同容器弹簧 |

- 动画可打断：展开途中再次点击，从当前尺寸直接反向，不等动画结束。
- `transform-origin` 跟随锚定角（§5.4）。
- `MotionConfig reducedMotion="user"`：系统开启"减少动态效果"时关闭位移、缩放和旋转，只保留 120ms 淡入淡出。

## 8. 设置

### 8.1 入口与界面

本阶段只做入口和简单界面。下表中已列出的四项按 §5、§6 的规格实现，其余位置用"更多设置即将推出"占位。见 [06-settings.png](mockups/06-settings.png)。

| 入口 | 位置 | 说明 |
|---|---|---|
| 岛内设置页 | 展开态头部的齿轮 | 在岛内翻页，返回箭头回到列表 |
| 插件页配置区 | 侧栏"插件" → 已安装 → dsh-session-float | 通过 `plugins.bundle.config` 渲染同一个 `SettingsForm` |

| 设置项 | 选项 | 默认 | 实现 |
|---|---|---|---|
| 外观 | 浅色 / 深色 / 系统 | 系统 | §6.1 |
| 收纳状态 | 简略 / 详细，卡片内带实时预览 | 详细 | §5.1 |
| 点击空白处收起 | 开关 | 开 | §5.5 |
| 仅在会话页中显示 | 开关 | 关 | §5.6 |
| 位置 | 显示当前锚定角和偏移，"恢复默认"按钮 | 左上角 16, 12 | §5.3 |

所有设置立即生效，不需要保存按钮，和 DSH 自己的"外观"设置行为一致。插件管理页的配置页约定是"只有保存才写入"，那是针对 Host 配置表单的；这里的偏好只存在浏览器本地，即时预览更直观。

### 8.2 存储

`prefs.ts` 提供一个小型 store（`getSnapshot` / `subscribe` / `update`），两个设置入口和岛本身读写同一份数据：

```ts
interface Prefs {
  version: 1
  appearance: 'light' | 'dark' | 'system'
  collapsedStyle: 'compact' | 'detailed'
  collapseOnOutsideClick: boolean
  onlyInConversation: boolean
  position: { corner: 'tl' | 'tr' | 'bl' | 'br'; dx: number; dy: number }
}
```

- 存在 `localStorage` 的 `dsh-session-float:prefs`。读取时逐字段校验，非法或缺失的字段回退到默认值，不因为一份坏数据导致岛无法显示。
- 监听 `storage` 事件，同一浏览器的多个标签页保持同步。
- 偏好按浏览器保存，不同设备可以各自设置位置和外观。如果需要跨设备同步，可以改用 Host 配置（`ctx.configForms`）。这需要 Host 侧声明 Config schema，见 §10 问题 4。

## 9. 实施里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 骨架 | package.json、patch、构建脚本（Motion 打包、共享模块 external）、overlay 中显示静态胶囊、插件页配置区占位 | `dsh plugin --profile web add link:<本目录>` 后刷新页面可见；确认 §3、§6.1、§7.1 的待验证项和体积 |
| M2 数据 | `classify()` + 单测；详细胶囊实时计数，隐藏数量为 0 的状态 | 启动、审批、结束会话时数字正确变化，与侧边栏状态点一致 |
| M3 面板 | 展开列表、分组排序、点击跳转、Esc、基础 layout 动画 | 从设置页或插件页点击会话也能回到会话界面 |
| M4 位置 | 拖动阈值、夹紧、锚定角换算与持久化、按角展开和收拢、`placement.ts` 单测 | 四个角展开方向正确；刷新后位置保留；窗口缩小时不出屏 |
| M5 设置 | prefs store、岛内设置页、插件页配置区、外观三态、简略 / 详细、点击空白处收起 | 两处入口修改同一份设置并即时生效；DSH 切换主题时"系统"跟随 |
| M6 打磨 | 按 §7.2 细调动画、计数变化动画、reduced-motion、i18n、无障碍 | 中英文切换正常；键盘可完整操作；减少动态效果模式下没有位移动画 |

## 10. 待确认问题

1. **默认位置与侧边栏重叠**：页面左上角正好是侧边栏的品牌行（见 [01-collapsed.png](mockups/01-collapsed.png)）。可选方案：(a) 保持页面左上角，用户自行拖开；(b) 默认放在主区域左上角，即 `x = 侧边栏宽度 + 16`；(c) 默认顶部居中。
2. **"已完成"的口径**：采用 §4 的"完成后未查看"，还是改为"最近 N 分钟内完成"？后者需要插件自己记录完成时间。
3. **子代理会话**：目前不计入统计，只在父会话行显示子代理运行数。
4. **设置的存储范围**：目前按浏览器保存（§8.2）。是否需要跨浏览器、跨设备同步？
5. **总数为 0 时**：目前显示淡化的 `0 活动`。是否需要再加一个"无活动时隐藏"的设置项？

## 11. 风险

- 依赖 `uiWorkspace.openSession`、`useSessionStatus`、`plugins.bundle.config`、`ctx.theme` 等 rc 版本接口，DSH 升级时可能变化。通过 `engines.dsh` 限定版本，并把接口访问集中在 `index.ts`。
- Motion 打进插件包会增加体积；如果它引用了共享表以外的模块（例如 `react-dom`），需要在 M1 的构建中确认能解析到外壳那一份。
- 浅色页面上的深色岛、深色页面上的浅色岛都是允许的组合，阴影和描边需要在四种组合下检查可读性。
