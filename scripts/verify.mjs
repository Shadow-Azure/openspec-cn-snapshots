#!/usr/bin/env node
// verify.mjs — 快照校验。三层检查，任一失败即退出码 1 并输出 expected vs actual：
//   1. manifest 完整性：schema、必填字段、artifacts 非空
//   2. 内容一致性：manifest 里每个 digest 与磁盘文件重新计算的结果一致
//   3. 期望比对：与 digests.lock.json（按 variant 分组）和/或
//      EXPECTED_OBJECT / EXPECTED_DIGEST 环境变量比对
//
// 用法：
//   node scripts/verify.mjs [--manifest manifest.json] [--lock digests.lock.json] \
//     [--variant claude/core] [--expected-object <name>] [--expected-digest <digest:…>]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definitionFileDigest } from "./digest.mjs";

const HELP = `usage: node scripts/verify.mjs [--manifest manifest.json]
  [--lock digests.lock.json] [--variant claude/core]
  [--expected-object <name>] [--expected-digest <digest:…>]
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(HELP);
    process.exit(0);
  }

  const problems = [];
  const warnings = [];
  const fail = (msg) => problems.push(msg);

  const manifestPath = resolve(args.manifest && args.manifest !== true ? args.manifest : "manifest.json");
  if (!existsSync(manifestPath)) fail(`manifest 不存在: ${manifestPath}`);
  let manifest = null;
  if (!problems.length) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (err) {
      fail(`manifest 不是合法 JSON: ${err.message}`);
    }
  }

  const base = dirname(manifestPath);

  if (manifest) {
    if (manifest.schemaVersion !== 1) fail(`不支持的 schemaVersion: ${manifest.schemaVersion}`);
    for (const field of ["source", "generation", "artifacts"]) {
      if (!manifest[field]) fail(`manifest 缺少 ${field} 段`);
    }
    if (Array.isArray(manifest.artifacts)) {
      if (manifest.artifacts.length === 0) fail("manifest.artifacts 为空，未生成任何产物");
      for (const a of manifest.artifacts) {
        for (const field of ["type", "name", "path", "sourcePath", "digest"]) {
          if (!a[field]) fail(`artifact 缺少字段 ${field}: ${JSON.stringify(a)}`);
        }
        if (!["skill", "agent", "command"].includes(a.type)) {
          fail(`未知 artifact.type: ${a.type} (${a.name})`);
        }
        if (a.type === "skill" && !a.path.endsWith("/SKILL.md")) {
          fail(`skill 产物路径必须以 /SKILL.md 结尾: ${a.path}`);
        }
        if (a.type === "agent" && !a.path.endsWith("/AGENT.md")) {
          fail(`agent 产物路径必须以 /AGENT.md 结尾: ${a.path}`);
        }
      }
    }
    const gen = manifest.generation ?? {};
    for (const field of ["tool", "profile", "workflowRun"]) {
      if (!gen[field]) fail(`manifest.generation 缺少 ${field}`);
    }
  }

  // 2) 内容一致性：磁盘文件重新计算的 digest 必须等于 manifest 记录
  if (manifest && Array.isArray(manifest.artifacts) && !problems.some((p) => p.startsWith("manifest"))) {
    for (const a of manifest.artifacts) {
      const p = join(base, a.path);
      if (!existsSync(p)) {
        fail(`artifact 文件缺失: ${a.path}`);
        continue;
      }
      const actual = definitionFileDigest(readFileSync(p, "utf8"));
      if (actual !== a.digest) {
        fail(`digest 与磁盘内容不一致: ${a.path}\n  manifest: ${a.digest}\n  disk:     ${actual}`);
      }
    }
  }

  // 3a) digests.lock.json 比对（按 variant 分组；lock 是"已知正确值"，不一致即失败）
  const lockPath = args.lock && args.lock !== true ? resolve(args.lock) : join(repoRoot, "digests.lock.json");
  let locked = {};
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      const variant =
        (args.variant && args.variant !== true ? args.variant : null) ??
        (manifest?.generation ? `${manifest.generation.tool}/${manifest.generation.profile}` : null);
      if (!variant) fail("无法确定 variant（无 --variant 且 manifest 缺 generation 段）");
      const group = lock.variants?.[variant];
      if (group == null) {
        warnings.push(`digests.lock 中没有 variant "${variant}" 的分组，跳过 lock 比对`);
      } else {
        locked = group;
        const byName = new Map((manifest?.artifacts ?? []).map((a) => [a.name, a]));
        for (const [name, expected] of Object.entries(group)) {
          const art = byName.get(name);
          if (!art) {
            fail(`lock 要求存在但本次未生成: ${name} (期望 ${expected})`);
          } else if (art.digest !== expected) {
            fail(`digest 与 lock 不一致: ${name}\n  lock:    ${expected}\n  actual:  ${art.digest}`);
          }
        }
        for (const a of manifest?.artifacts ?? []) {
          if (!(a.name in group)) warnings.push(`${a.name} 不在 lock 中（仅警告；如需钉住请更新 digests.lock.json）`);
        }
      }
    } catch (err) {
      fail(`digests.lock 解析失败: ${err.message}`);
    }
  } else {
    warnings.push(`未找到 digests.lock.json (${lockPath})，跳过 lock 比对`);
  }

  // 3b) 单对象期望值（--expected-* 参数或 EXPECTED_OBJECT/EXPECTED_DIGEST 环境变量）
  const expectedObject = (args["expected-object"] && args["expected-object"] !== true
    ? args["expected-object"]
    : process.env.EXPECTED_OBJECT ?? "").trim();
  const expectedDigest = (args["expected-digest"] && args["expected-digest"] !== true
    ? args["expected-digest"]
    : process.env.EXPECTED_DIGEST ?? "").trim();
  if (expectedObject || expectedDigest) {
    if (!expectedObject || !expectedDigest) {
      fail("expected-object 与 expected-digest 必须成对提供");
    } else {
      const art = (manifest?.artifacts ?? []).find((a) => a.name === expectedObject);
      if (!art) {
        fail(`期望对象未在产物中找到: ${expectedObject}（可用对象: ${(manifest?.artifacts ?? [])
          .filter((a) => a.type === "skill")
          .map((a) => a.name)
          .join(", ") || "无"}）`);
      } else if (art.digest !== expectedDigest) {
        fail(`digest 与期望值不一致: ${expectedObject}\n  expected: ${expectedDigest}\n  actual:   ${art.digest}`);
      } else {
        console.log(`verify: 期望值命中 ${expectedObject} = ${expectedDigest}`);
      }
    }
  }

  for (const w of warnings) console.log(`verify: WARN: ${w}`);
  if (problems.length) {
    console.error(`verify: FAILED — ${problems.length} 个问题`);
    for (const p of problems) console.error(`verify: ${p}`);
    process.exit(1);
  }
  console.log(`verify: PASS — manifest OK, ${(manifest?.artifacts ?? []).length} 个产物 digest 全部一致`);
}

main();
