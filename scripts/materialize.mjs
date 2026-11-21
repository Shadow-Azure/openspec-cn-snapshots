#!/usr/bin/env node
// materialize.mjs — 把 codespec init 的生成物重排为平台可读布局，并生成 manifest.json。
//
// 源布局（fixture 内，--tools claude 的生成结果）：
//   .claude/skills/<dir>/SKILL.md        （+ 同目录 extra files）
//   .claude/agents/<name>.md             （扁平）
//   .claude/commands/opsx/<id>.md
// 目标布局（--out，平台 target = repoUrl + subDir + ref）：
//   skills/<dir>/SKILL.md …              （整目录复制，保留 extra files）
//   agents/<name>/AGENT.md               （重排：扁平 → 目录 + 平台固定文件名）
//   commands/opsx/<id>.md                （平台暂无 command 类型，仅作记录）
//   manifest.json
//
// 用法：
//   node scripts/materialize.mjs --fixture <dir> --out <dir> \
//     --source-repo <url> --source-ref <ref> --source-commit <sha> \
//     --codespec-version <ver> --tool <tool> --profile <profile> \
//     --workflow-run <url> [--lockfile-mode frozen|no-frozen] \
//     [--node-version <major>] [--pnpm-version <ver>]

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { definitionFileDigest } from "./digest.mjs";

const HELP = `usage: node scripts/materialize.mjs --fixture <dir> --out <dir>
  --source-repo <url> --source-ref <ref> --source-commit <sha>
  [--source-branch <branch>]   # 真实分支名，写入 manifest.source.branch
  --codespec-version <ver> --tool <tool> --profile <profile>
  --workflow-run <url>
  [--lockfile-mode frozen|no-frozen] [--node-version <major>] [--pnpm-version <ver>]
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function fail(msg) {
  console.error(`materialize: ERROR: ${msg}`);
  process.exit(1);
}

/** 从 frontmatter 提取 name 字段（简单逐行解析，不支持多行值）。 */
export function parseFrontmatterName(text) {
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return null;
  const line = m[1].split("\n").find((l) => /^name:[ \t]*/.test(l));
  if (!line) return null;
  const value = line.replace(/^name:[ \t]*/, "").trim().replace(/^['"]|['"]$/g, "");
  return value || null;
}

function listSortedDirs(p) {
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function addArtifact(list, rec) {
  if (!rec.digest) fail(`产物 ${rec.path} 的 digest 为空（frontmatter 后无有效 body？）`);
  list.push(rec);
}

/** 删除目标目录中不在本次生成集合内的条目，避免上一次运行的 stale 文件混入快照。 */
function pruneStale(dir, keepNames) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (!keepNames.has(entry)) rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(HELP);
    process.exit(0);
  }
  const required = [
    "fixture",
    "out",
    "source-repo",
    "source-ref",
    "source-commit",
    "codespec-version",
    "tool",
    "profile",
    "workflow-run",
  ];
  for (const k of required) {
    if (!args[k] || args[k] === true) fail(`缺少必填参数 --${k}`);
  }

  const claudeDir = join(args.fixture, ".claude");
  if (!existsSync(claudeDir)) {
    fail(`fixture 中不存在 ${claudeDir}；init 可能失败，或该 tool 没有生成物`);
  }

  const artifacts = [];

  // 1) skills：.claude/skills/<dir>/SKILL.md → skills/<dir>/（整目录，含 extra files）
  const skillsSrc = join(claudeDir, "skills");
  if (!existsSync(skillsSrc)) fail(`缺少 ${skillsSrc}（tool=${args.tool} 未生成 skills？）`);
  const skillDirs = listSortedDirs(skillsSrc);
  if (skillDirs.length === 0) fail(`${skillsSrc} 下没有任何 skill 目录`);
  const skillsOut = join(args.out, "skills");
  mkdirSync(skillsOut, { recursive: true });
  for (const dir of skillDirs) {
    const src = join(skillsSrc, dir);
    const skillMd = join(src, "SKILL.md");
    if (!existsSync(skillMd)) fail(`skill 目录 ${dir} 缺少 SKILL.md`);
    const fmName = parseFrontmatterName(readFileSync(skillMd, "utf8")) ?? dir;
    const dest = join(skillsOut, dir);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    addArtifact(artifacts, {
      type: "skill",
      name: fmName,
      path: `skills/${dir}/SKILL.md`,
      sourcePath: `.claude/skills/${dir}/SKILL.md`,
      digest: definitionFileDigest(readFileSync(skillMd, "utf8")),
    });
  }

  // 2) agents：.claude/agents/<name>.md（扁平）→ agents/<name>/AGENT.md（平台读 AGENT.md）
  const agentsSrc = join(claudeDir, "agents");
  if (!existsSync(agentsSrc)) fail(`缺少 ${agentsSrc}（tool=${args.tool} 未生成 agents？）`);
  const agentFiles = readdirSync(agentsSrc).filter((f) => f.endsWith(".md")).sort();
  if (agentFiles.length === 0) fail(`${agentsSrc} 下没有任何 agent .md 文件`);
  mkdirSync(join(args.out, "agents"), { recursive: true });
  for (const f of agentFiles) {
    const stem = f.replace(/\.md$/, "");
    const text = readFileSync(join(agentsSrc, f), "utf8");
    mkdirSync(join(args.out, "agents", stem), { recursive: true });
    writeFileSync(join(args.out, "agents", stem, "AGENT.md"), text);
    addArtifact(artifacts, {
      type: "agent",
      name: stem,
      path: `agents/${stem}/AGENT.md`,
      sourcePath: `.claude/agents/${f}`,
      digest: definitionFileDigest(text),
    });
  }

  // 3) commands：.claude/commands/opsx/<id>.md → commands/opsx/<id>.md（仅记录，平台暂不消费）
  const commandsSrc = join(claudeDir, "commands", "opsx");
  if (!existsSync(commandsSrc)) fail(`缺少 ${commandsSrc}（core profile 应生成 opsx 命令）`);
  const cmdFiles = readdirSync(commandsSrc).filter((f) => f.endsWith(".md")).sort();
  if (cmdFiles.length === 0) fail(`${commandsSrc} 下没有任何 command .md 文件`);
  mkdirSync(join(args.out, "commands", "opsx"), { recursive: true });
  for (const f of cmdFiles) {
    const stem = f.replace(/\.md$/, "");
    const text = readFileSync(join(commandsSrc, f), "utf8");
    writeFileSync(join(args.out, "commands", "opsx", f), text);
    addArtifact(artifacts, {
      type: "command",
      name: `opsx:${stem}`,
      path: `commands/opsx/${f}`,
      sourcePath: `.claude/commands/opsx/${f}`,
      digest: definitionFileDigest(text),
    });
  }

  // 4) 清理 stale 条目（目录名/文件名不在本次集合内的旧内容）
  pruneStale(skillsOut, new Set(skillDirs));
  pruneStale(join(args.out, "agents"), new Set(agentFiles.map((f) => f.replace(/\.md$/, ""))));
  pruneStale(join(args.out, "commands", "opsx"), new Set(cmdFiles));

  // 5) manifest.json（确定性排序：type → name）
  artifacts.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const manifest = {
    schemaVersion: 1,
    source: {
      repo: args["source-repo"],
      // ref = workflow_dispatch 传入的 source_ref 原样（commit / 分支 / tag）
      // branch = 真实分支名（--source-branch 提供），否则回退为 ref
      ref: args["source-ref"],
      branch:
        args["source-branch"] && args["source-branch"] !== true
          ? args["source-branch"]
          : args["source-ref"],
      commit: args["source-commit"],
      codespecVersion: args["codespec-version"],
      node: args["node-version"] ?? null,
      pnpm: args["pnpm-version"] ?? null,
    },
    generation: {
      tool: args.tool,
      profile: args.profile,
      initArgs: ["--tools", args.tool, "--profile", args.profile, "--force"],
      lockfileMode: args["lockfile-mode"] && args["lockfile-mode"] !== true ? args["lockfile-mode"] : "frozen",
      workflowRun: args["workflow-run"],
      generatedAt: new Date().toISOString(),
    },
    artifacts,
  };
  writeFileSync(join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const count = (t) => artifacts.filter((a) => a.type === t).length;
  console.log(
    `materialize: OK — skills=${count("skill")} agents=${count("agent")} commands=${count("command")} -> ${args.out}`,
  );
  for (const a of artifacts) {
    console.log(`  [${a.type}] ${a.name} -> ${a.path} (${a.digest})`);
  }
}

main();
