---
name: design
description: 将原始架构需求（AR）转化为结构化成稿。两阶段流程：SubAgent 格式化扩写 + 主Agent 交互澄清。由 /opsx:design 命令调用。
license: MIT
compatibility: 需要 codespec CLI。
metadata:
  author: codespec
  version: "1.0"
  generatedBy: "1.3.1"
---

# 架构需求设计（/opsx:design）

将原始架构需求（AR）转化为结构化成稿。两阶段流程：SubAgent 格式化扩写 + 主Agent 交互澄清。

## 流程

### 输入
用户提供：
- 变更名称（kebab-case）
- 原始 AR 描述（自由格式文本）

### Phase 1: SubAgent 格式化扩写

1. 读取 AR 模板：ar-template.md（skill 目录下）
2. 调用 `design-expand` Agent，传入原始 AR 文本
3. Agent 按模板重组后输出 AR 初稿
4. 主Agent 将 AR 初稿写入临时文件

确保变更目录存在：
```bash
mkdir -p codespec/changes/<name>
```

### Phase 2: 主Agent 交互澄清

1. 读取 AR 初稿
2. 加载澄清规则：clarify-prompt.md（skill 目录下）
3. 探索代码仓，逐章走查 AR 初稿
4. 每发现需澄清的点，使用 AskUserQuestion 提问
5. 收集问答记录
6. 将修正后的内容 + 问答记录 + delta-spec 合并写入最终 AR 成稿

### 输出

写入：`codespec/changes/<name>/architecture-requirements.md`

内容包含：
- 第 1 部分：架构描述（系统上下文、模块划分、数据流接口、技术选型）
- 第 2 部分：需求场景（GIVEN/WHEN/THEN 格式）
- 第 3 部分：澄清记录与 delta-spec

### 后续

AR 成稿完成后，提示用户：
> "AR 成稿已写入 `architecture-requirements.md`。请 review，确认后可继续 `/opsx:plan` 生成 design.md 和 task.md。"

## 参考文件

- AR 模板：ar-template.md（skill 目录下）
- 格式化规则：expand-subagent.md（skill 目录下）
- 澄清规则：clarify-prompt.md（skill 目录下）
- SubAgent 定义：design-expand Agent

<!-- command: codespec-design -->
