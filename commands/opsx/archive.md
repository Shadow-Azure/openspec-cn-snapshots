---
name: "OPSX: Archive"
description: 归档实验性工作流中已完成的变更
category: Workflow
tags: [workflow, archive, experimental]
---

归档实验性工作流中已完成的变更。

**输入**：可选择在 `/codespec/archive` 后指定变更名称（例如，`/codespec/archive add-auth`）。如果省略，检查是否可以从对话上下文中推断出来。如果模糊或不明确，你必须提示可用的变更。

**步骤**

1. **如果没有提供变更名称，提示选择**

   运行 `codespec list --json` 获取可用变更。使用 **AskUserQuestion tool** 让用户选择。

   仅显示活动变更（未归档的）。
   如果可用，包括每个变更使用的 Schema。

   **重要提示**：不要猜测或自动选择变更。始终让用户选择。

2. **检查产出物完成状态**

   运行 `codespec status --change "<name>" --json` 检查产出物完成情况。

   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流 Schema
   - `artifacts`：产出物列表及其状态（`done` 或其他状态值）

   **如果有任何产出物不是 `done`：**
   - 显示列出未完成产出物的警告
   - 提示用户确认是否继续
   - 如果用户确认，则继续

3. **执行归档**

   使用 `codespec archive auto` 一条命令完成归档。CLI 会自动解析项目根（逐级向上查找 `.git`），把变更移动到正确的项目级 `codespec/changes/archive/YYYY-MM-DD-<name>/`。

   ```bash
   codespec archive auto "<name>"
   ```

   **禁止使用裸 `mkdir` + `mv` 归档**——相对路径会以 agent 当前工作目录为基准，可能把归档放到错误层级的 archive 目录。

4. **显示摘要**

   显示归档完成摘要，包括：
   - 变更名称
   - 使用的 Schema
   - 归档位置

**成功时的输出**

```
## 归档完成

**变更：** <change-name>
**Schema：** <schema-name>
**归档至：** codespec/changes/archive/YYYY-MM-DD-<name>/
**规范：** ✓ 已同步到主规范

所有产出物已完成。所有任务已完成。
```


**错误时的输出（归档已存在）**

```
## 归档失败

**变更：** <change-name>
**目标：** codespec/changes/archive/YYYY-MM-DD-<name>/

目标归档目录已存在。

**选项：**
1. 重命名现有归档
2. 如果是重复的，删除现有归档
3. 等待不同的日期再归档
```

**防护措施**
- 如果未提供变更，始终提示选择
- 使用产出物图（codespec status --json）进行完成度检查
- 不要在警告时阻止归档 - 只需告知并确认
- 移动到归档时保留 .codespec.yaml（它与目录一起移动）
- 显示清晰的操作摘要
- **禁止使用裸 `mkdir` + `mv` 归档**——始终通过 `codespec archive auto "<name>"` 让 CLI 解析项目根，避免归档落到错误层级的 archive 目录
