// digest.test.mjs — digest 算法单元测试（设计 11.1）。
// 运行：node --test tests/
//
// 锚点说明：
//   - 真实向量 1：obra/superpowers v6.4.1 skills/systematic-debugging/SKILL.md，
//     平台已知可复现值 digest:580c97cf…（fixture 随仓附带，防止上游漂移）。
//   - 合成用例的期望 sha256 由独立工具（node crypto one-liner）计算，避免循环验证。
//   - OpenSpec-cn codespec-subagent-driven-development 的 422aa… 目标值属于端到端
//     生成验证（见 README），不属于单元测试。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { definitionFileDigest, normalizeBody, stripFrontmatter } from "../scripts/digest.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("真实向量：superpowers v6.4.1 systematic-debugging", () => {
  const text = readFileSync(
    join(here, "fixtures", "superpowers-systematic-debugging-v6.4.1.md"),
    "utf8",
  );
  assert.equal(
    definitionFileDigest(text),
    "digest:580c97cf8ca79018df6692fd4ddb3cc8193b44cc91e51d1f9127b5818f1bf107",
  );
});

test("无 frontmatter：整文即 body", () => {
  assert.equal(
    definitionFileDigest("hello world"),
    "digest:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
});

test("frontmatter 剥离 + CRLF 归一化", () => {
  const text = "---\r\nname: demo\r\ndescription: x\r\n---\r\nbody line\r\n";
  assert.equal(
    definitionFileDigest(text),
    "digest:3f343d74f01c68985dc376c9e44b1472af7c4c513dd1f17d9481a39f427eb492",
  );
});

test("首尾空行与尾部空白去除", () => {
  const text = "---\nname: demo\n---\n\n\nbody\n\n   \n";
  assert.equal(
    definitionFileDigest(text),
    "digest:230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5",
  );
});

test("运行时追加标题截断（# Notes）", () => {
  const text = "---\nname: demo\n---\nline one\nline two\n# Notes\nappended\n";
  assert.equal(
    definitionFileDigest(text),
    "digest:b6858b03a6cae635deeaeab09a74e598979b72c917cbfff0bb3fe2cd05111dbc",
  );
});

test("各类运行时追加标题变体均截断", () => {
  const mk = (suffix) => `---\nname: x\n---\nbody\n${suffix}\ntail\n`;
  const variants = [
    "# Subagent Permissions",
    "subagent permission",
    "## Permission Notes",
    "Agent notes",
    "notes",
    "Token budget",
  ];
  for (const suffix of variants) {
    assert.equal(normalizeBody(stripFrontmatter(mk(suffix))), "body", `suffix=${suffix}`);
  }
});

test("普通标题（非运行时追加）不截断", () => {
  assert.equal(
    normalizeBody(stripFrontmatter("---\nname: x\n---\n# Usage\nstep 1\n")),
    "# Usage\nstep 1",
  );
});

test("空 body → null（无 digest）", () => {
  assert.equal(definitionFileDigest("---\nname: x\n---\n\n\n"), null);
  assert.equal(definitionFileDigest(""), null);
});

test("未闭合 frontmatter：stripFrontmatter 返回原文（记录参考实现行为）", () => {
  const text = "---\nname: x\nno closing";
  assert.equal(stripFrontmatter(text), text);
});

test("frontmatter 以文件末尾的 --- 结束（无尾随换行）", () => {
  // 参考实现对 endsWith("\n---") 的分支返回去尾后的文本，与平台行为保持一致。
  assert.equal(stripFrontmatter("---\nname: x\n---"), "---\nname: x");
});

test("normalizeBody 对 CRLF 与混合换行鲁棒", () => {
  assert.equal(normalizeBody("a\r\nb\rc\n"), "a\nb\nc");
});
