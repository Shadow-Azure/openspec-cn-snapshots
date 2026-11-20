#!/usr/bin/env node
// scan-secrets.mjs — 扫描生成产物中的密钥与本地路径泄漏（设计 6.7 安全合规）。
// 命中即退出码 1，workflow 因此失败，不打 tag。
//
// 用法：node scripts/scan-secrets.mjs [paths...]
//   缺省扫描 skills/ agents/ commands/ manifest.json

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PATTERNS = [
  { re: /\/home\/[A-Za-z0-9._-]+/g, label: "unix 用户路径" },
  { re: /\/Users\/[A-Za-z0-9._-]+/g, label: "macOS 用户路径" },
  { re: /C:[\\/]+Users[\\/]+[A-Za-z0-9._-]+/gi, label: "Windows 用户路径" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, label: "GitHub token" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, label: "GitHub fine-grained PAT" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: "AWS AccessKeyId" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: "Slack token" },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, label: "OpenAI 风格 key" },
  { re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY/g, label: "私钥块" },
];

function* walkFiles(root) {
  if (!existsSync(root)) return;
  const st = statSync(root);
  if (st.isFile()) {
    yield root;
    return;
  }
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkFiles(p);
    else if (s.isFile()) yield p;
  }
}

function main() {
  const roots =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : ["skills", "agents", "commands", "manifest.json"];

  const hits = [];
  let scanned = 0;
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // 不可解码（二进制）→ 跳过
      }
      if (text.includes("\0")) continue; // 二进制文件
      scanned++;
      for (const { re, label } of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          const before = text.slice(0, m.index);
          const line = before.split("\n").length;
          hits.push(`${file}:${line}  [${label}]  ${m[0].slice(0, 60)}…`);
        }
      }
    }
  }

  console.log(`scan-secrets: 扫描 ${scanned} 个文件（roots: ${roots.join(", ")}）`);
  if (hits.length) {
    console.error(`scan-secrets: FAILED — 命中 ${hits.length} 处：`);
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log("scan-secrets: PASS — 未发现密钥/本地路径泄漏");
}

main();
