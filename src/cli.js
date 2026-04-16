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
  const startedAt = Date.now();
  const { tokenOrder, saveFileName, autoRename } = getCliOptions(process.argv);

  const cwd = process.cwd();
  console.log(`开始扫描目录：${cwd}`);
  const { images, existingNames } = await listImageFiles(cwd);
  if (images.length === 0) {
    console.error("未发现 jpg/png 图片文件。");
    process.exitCode = 1;
    return;
  }

  // 简单并发控制：避免一次性压爆本地模型
  const concurrency = 3;
  console.log(`发现 ${images.length} 张图片，开始识别（并发：${concurrency}）...`);
  const results = [];
  let index = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const current = index++;
      if (current >= images.length) return;
      const filePath = images[current];
      const fileName = path.basename(filePath);
      try {
        console.log(`[${current + 1}/${images.length}] 识别中：${fileName}`);
        const analysis = await analyzeImage(filePath);
        results[current] = { filePath, analysis };
        done += 1;
        console.log(`[${done}/${images.length}] 完成：${fileName}`);
      } catch (err) {
        results[current] = { filePath, error: err };
        done += 1;
        console.error(
          `[${done}/${images.length}] 失败：${fileName} - ${err?.message || String(err)}`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, () => worker()));

  console.log("识别完成，生成改名计划...");
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
    console.log(`已写入：${outPath}`);
    if (!autoRename) {
      console.log(`耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return;
    }
  }

  if (!finalSaveName) {
    console.log("已生成 mv 命令：");
    process.stdout.write(output);
  }

  if (autoRename) {
    // 自动执行重命名（仅在同目录内）
    console.log(`开始执行改名（共 ${plan.operations.length} 个）...`);
    for (let i = 0; i < plan.operations.length; i += 1) {
      const op = plan.operations[i];
      const oldAbs = path.resolve(cwd, op.oldName);
      const newAbs = path.resolve(cwd, op.newName);
      console.log(`改名(${i + 1}/${plan.operations.length})：${op.oldName} -> ${op.newName}`);
      await fs.rename(oldAbs, newAbs);
    }
    console.log(`已执行改名，并记录到：${path.resolve(cwd, "rename.sh")}`);
  }

  console.log(`耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
