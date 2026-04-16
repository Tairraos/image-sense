#!/usr/bin/env node
/**
 * CLI 入口：扫描当前目录图片，调用本地 VLM 生成中文改名建议，并输出 mv 命令。
 *
 * 需求要点：
 * - 读取当前目录下所有 jpg/png 文件
 * - 使用 OpenAI 兼容 VLM（带视觉能力）识别图片内容，输出中文新文件名
 * - 支持 -c/-p/-b/-n（出现顺序决定文件名词序），-s 可保存到脚本/文本文件
 */

import fs from "node:fs/promises";
import path from "node:path";

import { getCliOptions } from "./options.js";
import { listImageFiles, buildRenamePlan } from "./rename.js";
import { analyzeImage } from "./vlm.js";

async function main() {
  const { tokenOrder, saveFileName, autoRename } = getCliOptions(process.argv);

  const cwd = process.cwd();
  const { images, existingNames } = await listImageFiles(cwd);
  if (images.length === 0) {
    console.error("未发现 jpg/png 图片文件。");
    process.exitCode = 1;
    return;
  }

  // 简单并发控制：避免一次性压爆本地模型
  const concurrency = 3;
  const results = [];
  let index = 0;

  async function worker() {
    while (true) {
      const current = index++;
      if (current >= images.length) return;
      const filePath = images[current];
      try {
        const analysis = await analyzeImage(filePath);
        results[current] = { filePath, analysis };
      } catch (err) {
        results[current] = { filePath, error: err };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, () => worker()));

  const plan = buildRenamePlan(
    results.map((r) => {
      if (!r) return null;
      return r;
    }),
    { tokenOrder, existingNames }
  );

  const output = plan.lines.join("\n") + (plan.lines.length ? "\n" : "");

  // -r：强制写 rename.sh 作为日志（即使用户提供了 -s 其它文件名）
  const finalSaveName = autoRename ? "rename.sh" : saveFileName;

  if (finalSaveName) {
    const outPath = path.resolve(cwd, finalSaveName);
    await fs.writeFile(outPath, output, "utf8");
    if (!autoRename) {
      console.log(`已保存：${outPath}`);
      return;
    }
  }

  if (!finalSaveName) {
    process.stdout.write(output);
  }

  if (autoRename) {
    // 自动执行重命名（仅在同目录内）
    for (const op of plan.operations) {
      const oldAbs = path.resolve(cwd, op.oldName);
      const newAbs = path.resolve(cwd, op.newName);
      await fs.rename(oldAbs, newAbs);
    }
    console.log(`已执行改名，并记录到：${path.resolve(cwd, "rename.sh")}`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
