#!/usr/bin/env node
/**
 * CLI 入口：扫描当前目录图片，调用本地 VLM 生成中文改名建议，并输出 mv 命令。
 *
 * 需求要点：
 * - 读取当前目录下所有 jpg/png 文件
 * - 使用 OpenAI 兼容 VLM（带视觉能力）识别图片内容，输出中文新文件名
 * - 支持 -c/-p/-b/-n（出现顺序决定文件名词序）
 * - 支持 --html：生成 rename.html（可预览图片、编辑新文件名、复制 mv 命令）
 */

import fs from "node:fs/promises";
import path from "node:path";

import { getCliOptions } from "./options.js";
import { listImageFiles, createRenamePlanner } from "./rename.js";
import { analyzeImage } from "./vlm.js";
import { buildRenameHtml } from "./html.js";

async function main() {
  const startedAt = Date.now();
  const { tokenOrder, html } = getCliOptions(process.argv);

  const cwd = process.cwd();
  console.log(`开始扫描目录：${cwd}`);
  const { images, existingNames } = await listImageFiles(cwd);
  if (images.length === 0) {
    console.error("未发现 jpg/png 图片文件。");
    process.exitCode = 1;
    return;
  }

  const planner = createRenamePlanner({ tokenOrder, existingNames });

  // 简单并发控制：避免一次性压爆本地模型
  const concurrency = 3;
  console.log(`发现 ${images.length} 张图片，开始识别（并发：${concurrency}）...`);
  const results = [];
  let index = 0;
  let done = 0;
  let planned = 0;
  let nextToPlan = 0;
  /** @type {string[]} */
  const mvLines = [];
  /**
   * @type {Array<{ oldName: string, newName: string, status: "ok" | "error" | "empty", note?: string }>}
   */
  const items = [];

  function flushPlans() {
    while (nextToPlan < images.length && results[nextToPlan]) {
      const r = results[nextToPlan];
      const oldName = path.basename(r.filePath);

      if (r.error) {
        mvLines.push(`# 跳过（识别失败）：${oldName}`);
        planned += 1;
        items.push({ oldName, newName: "", status: "error", note: "识别失败" });
        console.log(`[${planned}/${images.length}] 完成：${oldName} 建议更名：跳过（识别失败）`);
        nextToPlan += 1;
        continue;
      }

      if (!r.analysis) {
        mvLines.push(`# 跳过（无识别结果）：${oldName}`);
        planned += 1;
        items.push({ oldName, newName: "", status: "empty", note: "无识别结果" });
        console.log(`[${planned}/${images.length}] 完成：${oldName} 建议更名：跳过（无识别结果）`);
        nextToPlan += 1;
        continue;
      }

      const suggested = planner.suggest(oldName, r.analysis);
      mvLines.push(suggested.mvLine);
      items.push({ oldName, newName: suggested.newName, status: "ok" });
      planned += 1;
      console.log(`[${planned}/${images.length}] 完成：${oldName} 建议更名：${suggested.newName}`);
      nextToPlan += 1;
    }
  }

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
        console.log(`[${done}/${images.length}] 识别完成：${fileName}`);
        flushPlans();
      } catch (err) {
        results[current] = { filePath, error: err };
        done += 1;
        console.error(
          `[${done}/${images.length}] 失败：${fileName} - ${err?.message || String(err)}`
        );
        flushPlans();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, () => worker()));

  // 理论上已 flush 完，但这里再兜底一次
  flushPlans();
  console.log("识别完成，已生成全部改名建议。");

  const output = mvLines.join("\n") + (mvLines.length ? "\n" : "");

  if (html) {
    const htmlPath = path.resolve(cwd, "rename.html");
    await fs.writeFile(htmlPath, buildRenameHtml({ items }), "utf8");
    console.log(`已生成：${htmlPath}`);
  }

  console.log("已生成 mv 命令：");
  process.stdout.write(output);
  console.log(`耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
