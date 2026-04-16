/**
 * 扫描目录图片、基于识别结果生成新文件名，并输出 mv 命令。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { sanitizeToken, toPeopleCountWord } from "./utils.js";

/**
 * @param {string} dir
 * @returns {Promise<{ images: string[], existingNames: Set<string> }>}
 * 返回图片绝对路径列表（按文件名排序）以及目录已有文件名集合（用于避免目标名冲突）
 */
export async function listImageFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const existingNames = new Set(entries.map((e) => e.name));
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => {
      const ext = path.extname(name).toLowerCase();
      return ext === ".jpg" || ext === ".jpeg" || ext === ".png";
    })
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  return { images: files.map((name) => path.join(dir, name)), existingNames };
}

/**
 * @typedef {{
 *  filePath: string,
 *  analysis?: {
 *    personCount: number,
 *    pose: string,
 *    clothing: string,
 *    behavior: string
 *  },
 *  error?: unknown
 * }} AnalyzeResult
 */

/**
 * 生成 mv 命令（每个文件一行）。
 *
 * @param {(AnalyzeResult|null)[]} results
 * @param {{ tokenOrder: ("c"|"p"|"b"|"n")[], existingNames?: Set<string> }} options
 * @returns {{ lines: string[], operations: { oldName: string, newName: string }[] }}
 */
export function buildRenamePlan(results, options) {
  const tokenOrder = options.tokenOrder ?? [];
  const useDefaultRule = tokenOrder.length === 0; // 只要出现任何文件名参数（-c/-p/-b/-n），就忽略默认规则

  /** @type {Map<string, number>} key: 目标文件名（含扩展名） */
  const usedNameCounter = new Map();
  const reservedNames = new Set(options.existingNames ?? []);

  /** @type {string[]} */
  const lines = [];
  /** @type {{ oldName: string, newName: string }[]} */
  const operations = [];

  for (const r of results) {
    if (!r) continue;
    const oldPath = r.filePath;
    const oldName = path.basename(oldPath);
    const ext = path.extname(oldName);

    if (r.error) {
      // 保持输出结构可执行：失败则跳过，但给出注释提示
      lines.push(`# 跳过（识别失败）：${oldName}`);
      continue;
    }

    const analysis = r.analysis;
    if (!analysis) {
      lines.push(`# 跳过（无识别结果）：${oldName}`);
      continue;
    }

    const personCount = Number.isFinite(analysis.personCount) ? analysis.personCount : 0;
    const pose = sanitizeToken(analysis.pose);
    const clothing = sanitizeToken(analysis.clothing);
    const behavior = sanitizeToken(analysis.behavior);

    /** @type {string[]} */
    const tokens = [];

    if (useDefaultRule) {
      // 默认命名规则（未指定 -c/-p/-b/-n 时）
      if (personCount <= 1) {
        if (pose) tokens.push(pose);
        if (clothing) tokens.push(clothing);
        if (tokens.length === 0) tokens.push("单人照");
      } else {
        if (behavior) tokens.push(behavior);
        else tokens.push("多人活动");
      }
    } else {
      // 自定义命名规则（参数出现顺序即词序）
      for (const flag of tokenOrder) {
        if (flag === "c" && clothing) tokens.push(clothing);
        if (flag === "p" && pose) tokens.push(pose);
        if (flag === "b" && behavior) tokens.push(behavior);
        if (flag === "n") tokens.push(toPeopleCountWord(personCount));
      }
      if (tokens.length === 0) tokens.push("未命名");
    }

    const baseName = tokens.join("_");
    const desired = `${baseName}${ext}`;
    const unique = toUniqueName(desired, usedNameCounter, reservedNames);
    reservedNames.add(unique);

    // 引号：避免空格/特殊字符导致 shell 解析问题
    lines.push(`mv "${oldName}" "${unique}"`);
    operations.push({ oldName, newName: unique });
  }

  return { lines, operations };
}

/**
 * @param {string} desiredNameWithExt
 * @param {Map<string, number>} usedNameCounter
 * @param {Set<string>} reservedNames
 * @returns {string}
 */
function toUniqueName(desiredNameWithExt, usedNameCounter, reservedNames) {
  const ext = path.extname(desiredNameWithExt);
  const base = desiredNameWithExt.slice(0, -ext.length);

  const prev = usedNameCounter.get(desiredNameWithExt) ?? 0;
  if (prev === 0 && !reservedNames.has(desiredNameWithExt)) {
    usedNameCounter.set(desiredNameWithExt, 1);
    return desiredNameWithExt;
  }

  let i = prev;
  while (true) {
    const candidate = `${base}_${i}${ext}`;
    if (!usedNameCounter.has(candidate) && !reservedNames.has(candidate)) {
      usedNameCounter.set(desiredNameWithExt, i + 1);
      usedNameCounter.set(candidate, 1);
      return candidate;
    }
    i += 1;
  }
}
