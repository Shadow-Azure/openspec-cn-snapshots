// digest.mjs — OpenSpec-cn 产物快照仓的 digest 计算
//
// 必须与 Harness Evolution 平台 apps/api/app/utils/definition.py 保持一致：
//   1. 去掉开头 YAML frontmatter（---\n...\n---\n）
//   2. 统一换行符为 \n
//   3. 去掉首尾空行
//   4. 遇到运行时追加标题（subagent permissions / permission notes /
//      agent notes / notes / token budget）时截断
//   5. 去除尾部空白
//   6. SHA-256，输出 "digest:<hex>"
//
// 用法：
//   node scripts/digest.mjs <file...>   # 计算一个或多个文件
//   node scripts/digest.mjs --stdin     # 从 stdin 读取

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * 去掉开头 YAML frontmatter。输入先做换行归一化再探测；
 * 找不到闭合时返回原文（与平台实现一致）。
 */
export function stripFrontmatter(text) {
  const n = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!n.startsWith("---\n")) return text;
  const closing = n.indexOf("\n---\n", 4);
  if (closing !== -1) return n.slice(closing + 5);
  if (n.endsWith("\n---")) return n.slice(0, -4);
  return text;
}

/**
 * 归一化 body：统一换行、去首尾空行、按运行时追加标题截断、去尾部空白。
 * 空 body 返回 null（与平台一致，null 不产生 digest）。
 */
export function normalizeBody(text) {
  const n = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\n+|\n+$/g, "");
  const lines = n.split("\n");
  const suffix =
    /^\s*(?:#{1,6}\s*)?(?:subagent\s+permissions?|permission\s+notes?|agent\s+notes?|notes|token\s+budget)\b/i;
  const cut = lines.findIndex((line) => suffix.test(line));
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).join("\n");
  return kept.replace(/\s+$/, "") || null;
}

/**
 * 计算定义文件 digest：digest:<sha256hex>；body 为空时返回 null。
 */
export function definitionFileDigest(text) {
  const body = normalizeBody(stripFrontmatter(text));
  return body
    ? `digest:${createHash("sha256").update(body, "utf8").digest("hex")}`
    : null;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "usage: node scripts/digest.mjs <file...> | --stdin\n" +
        "  prints \"<file>\\tdigest:<hex>\" per file\n",
    );
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 2);
  }
  if (args[0] === "--stdin") {
    const input = readFileSync(0, "utf8");
    const d = definitionFileDigest(input);
    process.stdout.write(`${d ?? "<null>"}\n`);
    if (!d) process.exit(1);
    return;
  }
  let failed = false;
  for (const file of args) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      process.stderr.write(`digest: cannot read ${file}: ${err.message}\n`);
      failed = true;
      continue;
    }
    const d = definitionFileDigest(text);
    if (!d) {
      process.stdout.write(`${file}\t<null>\n`);
      failed = true;
      continue;
    }
    process.stdout.write(`${file}\t${d}\n`);
  }
  if (failed) process.exit(1);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main(process.argv);
