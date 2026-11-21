# openspec-cn-artifacts

**OpenSpec-cn 产物快照仓**：把 [chenmr0/OpenSpec-cn](https://github.com/chenmr0/OpenSpec-cn) 的生成产物（skill / agent / command）物化为可被 Harness Evolution 平台直接读取、可按版本锚定的快照。

> **artifact-only 声明**：本仓是 OpenSpec-cn 的**派生产物仓**。平台在本仓上的改动只会进化"运行时产物"，**不会**改到 OpenSpec-cn 的 TypeScript 模板（`src/core/templates/**/*.ts`），因此不应被称为"OpenSpec-cn 源码进化"。产物 → 源码回写需要另行建立映射表与流程（见文末"未覆盖项"）。

## 它做什么

一个 GitHub Action（`.github/workflows/snapshot.yml`）：

```text
workflow_dispatch(source_repo, source_ref, tool, profile, expected_*, dry_run)
  1. checkout 源仓 @ source_ref
  2. pnpm install（frozen 失败自动降级 no-frozen 并在 manifest 标记）+ pnpm build
  3. 在临时 fixture 执行 codespec init --tools <tool> --profile <profile> --force
  4. 物化到平台可读布局（materialize.mjs）
  5. 计算 digest 并三重校验（verify.mjs）：manifest ↔ 磁盘 ↔ digests.lock / 期望值
  6. 安全扫描（scan-secrets.mjs）：密钥 / 本地路径泄漏
  7. dry_run=false 时：commit 到 snapshots 分支，打不可变 tag，push
```

平台只把本仓当 target（`repoUrl + subDir + ref`），不关心生成过程，也不需要 Node / pnpm / codespec 构建链。

## 使用

### 触发快照

Actions → **snapshot-openspec-cn** → Run workflow：

| 输入 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `source_repo` | 否 | `chenmr0/OpenSpec-cn` | 源仓 |
| `source_ref` | **是** | — | commit / 分支 / tag |
| `tool` | 否 | `claude` | 轨迹环境为 Claude Code |
| `profile` | 否 | `core` | codespec 档案 |
| `expected_object` / `expected_digest` | 否 | — | 成对使用；单对象期望值校验 |
| `dry_run` | 否 | `false` | 只生成与校验，不 commit / 不打 tag |

典型流程：先用 `dry_run=true` 看 digest 是否与 lock / 期望值一致，再关掉 dry_run 正式发版。

### 手工验证某个文件

```bash
node scripts/digest.mjs <SKILL.md 或 AGENT.md>
# 输出 digest:<64位hex>，与轨迹事件里的 definitionHash 同算法
```

### 本地开发

```bash
node --test          # digest 单元测试（含 superpowers v6.4.1 真实向量）
```

## 分支与 tag 模型

```text
main        README、workflow、scripts、tests、digests.lock.json（不要放产物）
snapshots   每次生成一个 commit；tag 指向这里的 commit（不要手动编辑）
```

- **不要一版本一分支**：平台版本列表来自 tag，一个分支可承载任意多个 tag。
- 快照 commit 只改 `skills/`、`agents/`、`commands/`、`manifest.json`。
- tag 命名：`openspec-cn-<short_commit>-<tool>-<profile>`，例如 `openspec-cn-a7ec200-claude-core`。
  同一源 commit 的多 config 变体可扩展 `-cfg<8hex>` 后缀（当前未启用 config 注入）。
- **tag 不可变**：已存在即失败；不覆盖、不移动、不删除；不 force push。

## 目录布局（tag 下）

```text
skills/<name>/SKILL.md            # 整目录复制，保留 extra files
agents/<name>/AGENT.md            # 由扁平 .claude/agents/<name>.md 重排（平台固定读 AGENT.md）
commands/opsx/<id>.md             # 仅作记录；平台暂无 command 对象类型
manifest.json                     # 源信息 + 工具版本 + 每个产物的 digest
```

### manifest.json

```json
{
  "schemaVersion": 1,
  "source":   { "repo", "branch" (=source_ref 原样), "commit", "codespecVersion", "node", "pnpm" },
  "generation": { "tool", "profile", "initArgs", "lockfileMode", "workflowRun", "generatedAt" },
  "artifacts": [ { "type": "skill|agent|command", "name", "path", "sourcePath", "digest" } ]
}
```

> `lockfileMode`：源仓个别 commit 的 lockfile 与 package.json 不一致（如 `a7ec200` 新增 `jsonc-parser` 未更新锁），
> 此时 workflow 自动降级 `--no-frozen-lockfile` 并在此标记 `no-frozen`，提示该快照依赖安装期解析。

## digest 算法

与平台 `apps/api/app/utils/definition.py` 一致（实现见 `scripts/digest.mjs`）：

1. 去掉开头 YAML frontmatter（`---\n...\n---\n`）；
2. 统一换行符为 `\n`；
3. 去掉首尾空行；
4. 遇运行时追加标题（subagent permissions / permission notes / agent notes / notes / token budget）截断；
5. 去尾部空白；
6. SHA-256，输出 `digest:<hex>`。

测试向量（单元测试内置）：

| 文件 | digest |
|---|---|
| obra/superpowers v6.4.1 `skills/systematic-debugging/SKILL.md`（fixture 在 `tests/fixtures/`） | `digest:580c97cf8ca79018df6692fd4ddb3cc8193b44cc91e51d1f9127b5818f1bf107` |
| OpenSpec-cn `codespec-subagent-driven-development`（目标值，本地已复现命中） | `digest:422aa583b5c148f9a2d40091825ad3a8d82f719b40865dfac95f7abe52b04c38` |

2026-11-20 本地复现记录：`a7ec2006c95fb53cebe7817dc2df656f4997a62b` + `--tools claude --profile core --force` →
6 skills / 5 agents / 4 commands，`codespec-subagent-driven-development` digest 命中目标值
（环境：codespec 1.3.1，node 24 / pnpm 10.33.0；产物为模板静态文本，与 node 小版本无关）。

### digests.lock.json（v2：按 commit 分组）

`variants["<tool>/<profile>"].commits[<短commit>][<objectName>] = "digest:…"` 记录各 commit 的已知正确值：

- **新 commit 首次构建**：无 lock 记录 → 警告并放行，tag 忠实记录实际内容（2026-11-21 确认的策略）。
- **同一 commit 再次构建**：有记录 → 强制比对，不一致 **失败并输出 diff，不打 tag**（防生成环境漂移静默发版）。
- **a7ec200 的 `422aa…`** 是生产轨迹锚点（`codespec-subagent-driven-development`），永久保留、不可改动。
- 落锁方式：人工编辑，或用成功 run 上传的 manifest artifact 代为生成。

对象名称对不上时宁可先不配，不要猜——轨迹里的 `test-driven-development` 可能来自 Superpowers，也可能是
OpenSpec-cn 新一代产物（`codespec-*` 已改名），跨源同名只能靠 digest 区分。

## 平台接入

### skill（首期可用）

```json
{
  "objectType": "skill",
  "objectName": "codespec-subagent-driven-development",
  "repoUrl": "https://github.com/Shadow-Azure/openspec-cn-snapshots.git",
  "subDir": "skills/codespec-subagent-driven-development",
  "defaultRef": "openspec-cn-a7ec200-claude-core",
  "enabled": true
}
```

平台读取该 tag 下 `skills/<name>/SKILL.md`，计算 digest，与轨迹 `objectRevision` / `definitionHash` 匹配。

### agent（文件就位，但**不可当已可用**）

`agents/<name>/AGENT.md` 已按平台布局物化；但生产轨迹里 agent 事件的 `objectRevision=unknown`、无 `definitionHash`，
平台无法把会话关联到 agent 目标。需先修轨迹采集（记录定义哈希 / 显式版本）或平台支持主 session agent switch 证据。

### command（暂不可进化）

平台对象类型只有 skill / agent / knowledge。`commands/opsx/*.md` 仅作记录（选项 A）；
要进化需平台新增 command 类型或"包装成 skill"（选项 B，进化的是包装层），须另行决策。

### 只读 vs 可写

- **只读快照模式**：平台只能读取分析，不能发布候选分支，进化闭环止于分析。
- **可写模式**：平台账号有写权限后可 push `<run_branch>/candidate/rN`。要求：分支保护放行平台账号、
  tag 保护只允许 Action/管理员、候选分支命名空间与快照 tag 分离、评测网关知道"仓 + 候选 ref + project ID"映射。
  评测侧不联调，第 7 步（验证）就无法完成。

## 安全与合规

- 产物中不得出现 token / 密码 / 本地绝对路径 / 用户目录；`scan-secrets.mjs` 扫描 `/home/`、`/Users/`、`C:\Users\`、
  `ghp_*`/`github_pat_*`/`gho_*` 等、`AKIA…`、Slack/OpenAI key、私钥块，命中即失败。
- 本仓不存 `.env` 或含私有配置的 `codespec/config.yaml`（init 生成在 `.claude` 之外，不会进入快照）。
- 第三方 action 固定到 SHA（见 workflow 注释）；私有源仓可用只读 `SOURCE_REPO_TOKEN` secret。
- 上游内容均 MIT：见 [NOTICE](NOTICE) 与 [LICENSE](LICENSE)。

## 覆盖矩阵（与设计文档对齐）

| 能力 | 覆盖 | 说明 |
|---|---|---|
| skill 产物 / tag / digest | ✅ | 本仓 + Action |
| agent 产物文件布局 | ✅（文件） | `AGENT.md` 重排 |
| agent 轨迹版本证据 | ❌ | 轨迹 `unknown`，需采集侧修复 |
| command 对象类型 | ❌ | 平台无类型；包装方案另行决策 |
| 真实 patch | ❌ | 平台侧 `placeholder` / `minimal-config` |
| 评测 / 候选发布 | ⚠️ | 需可写模式 + 评测侧映射 |
| 数据充分性 | ❌ | 6 个问题、无 holdout；本仓不增加样本 |
| 回写 OpenSpec-cn 源码 | ❌ | 需"产物路径 → 模板文件 → 插入位置"映射表与流程 |

## 已知限制与开放问题

1. 仓库归属 / 可见性 / 只读 vs 可写——建仓时决定，README 接入示例中的 `<org>` 按实际替换。
2. config 变体（`-cfg<8hex>` tag 后缀）已预留命名规则，workflow 暂不注入自定义 config。
3. 旧 tag 保留策略与仓库体积上限未定；当前只增不删。
4. 同一 source_ref + tool + profile 重复运行会因 tag 已存在而幂等失败——这是特性，不是 bug。
5. 触发方式：经确认（2026-11-20）**保持纯 `workflow_dispatch` 手动触发**，不自动跟踪上游更新——每个快照都是有意发布；如需自动化，`schedule` / `repository_dispatch` 是预留扩展点。
6. lock 策略（2026-11-21 确认）：**按 commit 分组，新版本放行**——新 commit 首建无记录即放行（tag = 实际内容），同 commit 重建强制比对防漂移；a7ec200 轨迹锚点永久保留。注意：与 a7ec200 内容不同的 tag 无法与现有 39 条轨迹关联（轨迹锚定旧命名 `codespec-*`），仅作新一代产物的忠实记录。`main-copy-ar2`（06eaf76）上游分支自身编译损坏（`archive.ts` 引用缺失的 `git-auto-commit.js`），修复前无法快照。

## 文件地图

| 路径 | 职责 |
|---|---|
| `.github/workflows/snapshot.yml` | 快照主流水线（workflow_dispatch） |
| `.github/workflows/ci.yml` | digest 单测 + lock 格式 + materialize/verify 冒烟 |
| `scripts/digest.mjs` | 平台同款 digest 算法（可独立 CLI） |
| `scripts/materialize.mjs` | fixture → 平台布局 + manifest.json |
| `scripts/verify.mjs` | manifest ↔ 磁盘 ↔ lock/期望值 三重校验 |
| `scripts/scan-secrets.mjs` | 密钥 / 路径泄漏扫描 |
| `digests.lock.json` | 已知正确 digest（按 tool/profile 分组） |
| `tests/` | digest 单元测试与 fixture |
| `.snapshots-seed/` | snapshots 孤儿分支的初始内容（建仓用，已 gitignore） |
