# dsh-session-float

DeepSeek Harness Web 的活动会话"灵动岛"。收纳态显示活动会话总数和待处理 / 已完成 / 进行中的数量，点击展开查看详情，点击会话即可跳转。

- 收纳态分**详细**（图标 + 数字 + 文字）和**简略**（数字写在状态图标中心）两种；数量为 0 的状态不显示。
- 展开列表按待处理 → 已完成 → 进行中分组，组内按最近活动排序，当前打开的会话带竖条标记。
- 可拖动到任意位置。松手时按所在半屏锚定到最近的角，展开和收拢都以这个角为原点：在左侧时向右展开，在右侧时向左展开。
- 外观可选浅色、深色（比 DSH 深色亮一级）、系统（跟随 DSH 当前主题）。
- 可选"点击空白处收起"。Esc、收起按钮、点击会话也会收起。
- 设置有两个入口：展开面板头部的齿轮，以及侧栏 **插件 → dsh-session-float** 的详情页。两处共用同一份设置。

设计说明见 [docs/DESIGN.md](docs/DESIGN.md)。

## 安装

安装最新发布版（`main` 分支）：

```sh
dsh plugin --profile web add github:MorzerChimes/dsh-session-float
```

安装指定版本（按版本标签，内容固定不变）：

```sh
dsh plugin --profile web add github:MorzerChimes/dsh-session-float#v0.1.0
```

所有版本见仓库的 [Tags](https://github.com/MorzerChimes/dsh-session-float/tags)。

从本地源码安装（开发用）：

```sh
npm install
npm run build
dsh plugin --profile web add link:$(pwd)
```

profile 启用了 HMR（`patchReload: live`）时，已打开的页面会自动加载插件；否则重启 `dsh web`。卸载：

```sh
dsh plugin --profile web remove dsh-session-float
```

## 状态规则

与侧边栏的会话状态点一致，每个会话只归入一类：

| 状态 | 条件 |
|---|---|
| 待处理 | 有等待用户处理的交互（审批、计划待审、提问） |
| 已完成 | 运行结束且用户尚未打开查看（`completionUnread`，刷新页面后清空） |
| 进行中 | 正在运行，且不属于以上两类 |

子代理会话、已归档会话和空白会话不计入。

## 开发

```sh
npm run check        # tsc + vitest + build
npm run build        # 生成 lib/client.js
```

- `src/client/classify.ts`、`placement.ts`、`prefs.ts`、`theme.ts` 是纯函数模块，单测在 `test/`。
- `scripts/build.mjs` 把浏览器半侧打包成 DSH 客户端模块格式。React 等 Web 外壳共享模块保持 external，Motion 打进包内。如果产物引用了共享表以外的模块，构建会直接失败。
- `dev/` 是本地预览工具：`dev/index.html` 通过伪造的 `__ModuleLoader__` 和 DSH 服务加载**构建后的** `lib/client.js`，URL 参数控制场景（`?counts=1,1,2&style=compact&corner=tr&scheme=dark&open=1`）；`dev/cdp.mjs` 用 Chrome DevTools Protocol 做实时的点击、拖动、截图检查。

```sh
npx esbuild dev/harness.tsx --bundle --format=iife --jsx=automatic --outfile=dev/harness.js --define:process.env.NODE_ENV='"production"'
python3 -m http.server 8765 --bind 127.0.0.1
# 打开 http://127.0.0.1:8765/dev/index.html?counts=1,1,2&open=1
```

## 分支与版本

| 名称 | 用途 |
|---|---|
| `main` | 最新发布版，默认安装来源 |
| `vX.Y.Z` 标签 | 每次发布的固定版本，供安装指定版本 |
| `release/vX.Y` 分支 | 该版本线的维护分支，用于在旧版本上发布补丁（如 `v0.1.1`） |

发布流程：在开发分支完成修改，更新 `package.json` 的 `version`，运行 `npm run check` 后提交（`lib/client.js` 必须一起提交）；合并到 `main`，打 `vX.Y.Z` 标签，推送分支和标签。

## 已知限制

- 设置保存在浏览器 `localStorage`（`dsh-session-float:prefs`），不跨浏览器或设备同步。
- "已完成"只在当前页面进程内有效，刷新后丢失。这是 DSH `completionUnread` 的语义。
- 依赖 DSH `0.2.1-rc.2` 的 `shell.overlay`、`plugins.bundle.config`、`useSessionStatus`、`uiWorkspace.openSession` 等接口，DSH 升级时可能需要适配。

## 许可

MIT
