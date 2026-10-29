# AGENTS.md

本文件是给 AI 编程助手（DeepSeek Harness、Codex、Claude Code 等）的项目约定。修改本仓库前请先阅读。

## 语言

- 所有文档使用**中文**，包括 README、`docs/` 下的文档、CHANGELOG。
- git 提交信息使用**中文**。
- 代码中的标识符保持英文；代码注释中英文均可，新写的注释优先使用中文。
- 界面文案同时维护中文和英文（`src/client/locales.ts`），新增文案两种语言都要补齐。

## 提交信息

格式：`类型：简要说明`，冒号使用中文全角冒号，说明不超过 50 个字。需要时空一行写正文，说明改了什么、为什么改。

| 类型 | 用途 |
|---|---|
| 功能 | 新功能 |
| 修复 | bug 修复 |
| 文档 | 只改文档 |
| 样式 | 界面样式调整，不改逻辑 |
| 重构 | 不改变行为的代码调整 |
| 测试 | 新增或修改测试 |
| 构建 | 构建脚本、依赖、打包配置 |
| 杂项 | 其他，例如配置文件、许可证 |
| 发布 | 版本发布，例如 `发布：v0.2.0` |

示例：

```
功能：收纳态支持隐藏总数为 0 的胶囊

在设置中新增「无活动时隐藏」开关，默认关闭。
```

提交身份：Merlin Hermes <merlinhermes@qq.com>。

## 文档位置

- 所有文档放在 `docs/` 下，目录说明见 `docs/README.md`。
- 根目录 `README.md` 只保留：功能介绍、安装方式、效果预览、更新记录。开发、构建、发布等内容放到 `docs/`。
- `CHANGELOG.md` 是完整的更新记录；README 的「更新记录」只列最近几个版本的要点，并链接到 CHANGELOG。
- README 使用的截图放在 `docs/images/`，设计阶段的效果图放在 `docs/design/mockups/`。

## 分支

- 新功能在 `dev` 分支开发；`main` 是最新发布版，只通过合并更新。
- 旧版本的 bug 修复在 `release/vX.Y` 分支上完成，并合并回 `dev`。
- 详细流程见 `docs/release.md`。

## 提交前检查

- 运行 `npm run check`（类型检查、单元测试、构建），全部通过后再提交。
- `lib/client.js` 是构建产物，但**必须提交**：用户从 git 安装时 DSH 不会构建。修改 `src/` 后一定要重新构建并一起提交。
- 构建脚本会拒绝引用 Web 外壳共享模块表以外的依赖；不要绕过这个检查。

## 代码约定

- 纯逻辑放在 `classify.ts`、`placement.ts`、`prefs.ts`、`theme.ts` 这类无 DOM 依赖的模块中，并在 `test/` 补单元测试。
- DSH 接口只在 `src/client/index.tsx` 中读取，组件通过 props 拿数据，方便在 `dev/` 预览环境中替换。
- 新增设置项时同步修改 `Prefs`、`parsePrefs` 的字段校验和默认值，以及 `SettingsForm.tsx`。
- 详细说明见 `docs/development.md`，设计依据见 `docs/design/README.md`。
