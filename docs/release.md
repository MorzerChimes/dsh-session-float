# 分支与发布

## 分支与标签

| 名称 | 类型 | 用途 |
|---|---|---|
| `main` | 分支 | 最新发布版，默认安装来源。只通过合并进入，不直接开发 |
| `dev` | 分支 | 日常开发，新功能在这里完成 |
| `release/vX.Y` | 分支 | 某个版本线的维护分支，只修 bug，例如 `release/v0.1` |
| `vX.Y.Z` | 标签 | 每次发布的固定版本，打好后不再移动 |

改动放在哪里：

| 改动类型 | 分支 | 发布成 |
|---|---|---|
| 新功能 | `dev` | 下一个次版本，例如 `v0.2.0` |
| 旧版本的 bug 修复 | `release/vX.Y` | 补丁版本，例如 `v0.1.1` |

在 `release/vX.Y` 上修完 bug 后，要把修复合并回 `dev`，否则下个版本会丢掉这个修复。

## 发布新版本

以发布 `v0.2.0` 为例：

```sh
git switch dev
# 1. 修改 package.json 的 version 为 0.2.0
# 2. 在 CHANGELOG.md 和 README.md 的「更新记录」中写好本版本内容
npm run check                     # 类型检查 + 单元测试 + 构建
git add -A
git commit -m "发布：v0.2.0"

git switch main
git merge --ff-only dev
git tag -a v0.2.0 -m "dsh-session-float v0.2.0"
git push origin dev main v0.2.0

# 需要维护这个版本线时
git branch release/v0.2 v0.2.0
git push origin release/v0.2
```

## 发布补丁版本

以在 0.1 版本线上发布 `v0.1.1` 为例：

```sh
git switch release/v0.1
# 修复 bug，修改 version 为 0.1.1，更新 CHANGELOG.md
npm run check
git commit -am "修复：……"
git tag -a v0.1.1 -m "dsh-session-float v0.1.1"
git push origin release/v0.1 v0.1.1

# 把修复带回开发分支
git switch dev
git merge release/v0.1
```

## 发布前检查

- `npm run check` 全部通过。
- `lib/client.js` 已重新构建并提交。别人安装时直接使用这个文件。
- `package.json` 的 `version` 与标签一致。
- `CHANGELOG.md` 和 README 的「更新记录」已更新。
- 在本机 DSH 中刷新页面，确认收纳、展开、跳转、拖动、设置都正常。

## 用户如何安装

```sh
# 最新发布版
dsh plugin --profile web add github:MorzerChimes/dsh-session-float
# 指定版本
dsh plugin --profile web add github:MorzerChimes/dsh-session-float#v0.1.0
```

已经安装的用户不会自动更新。他们的 `pnpm-lock.yaml` 记录了安装时的提交，需要卸载后重新安装才会拿到新版本。
