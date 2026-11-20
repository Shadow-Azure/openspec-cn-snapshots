# snapshots — 快照分支（孤儿分支）

本分支只承载自动生成的快照 commit（`skills/`、`agents/`、`commands/`、`manifest.json`）
与指向这些 commit 的 tag。**不要手动编辑本分支**。

- 生成逻辑、脚本与 `digests.lock.json` 都在 `main` 分支，由 workflow 检出 main（`ci/`）执行。
- 快照 tag：`openspec-cn-<short_commit>-<tool>-<profile>`，不可覆盖、不可移动、不删除。
- 平台 target 形如 `repoUrl + subDir + ref`，`ref` 即本分支上的 tag。
