#!/usr/bin/env node
/**
 * CLI 入口：扫描当前目录图片，调用本地 VLM 读取图片属性，然后启动临时 Web 服务进行管理与更名。
 *
 * 需求要点：
 * - 命令不接受任何参数
 * - 扫描当前目录下所有 jpg/png 图片
 * - 逐张输出识别到的属性（主体/场景/人数/动作或互动/服装）
 * - 属性读取完成后启动临时 Web 服务，并在控制台输出访问地址
 */

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

import { listImageFiles } from "./rename.js";
import { buildBaseNameFromAttrs } from "./utils.js";
import { analyzeImage } from "./vlm.js";
import { startServer } from "./server.js";

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args.includes("-h") || args.includes("--help")) {
      console.log("用法：image-sense");
      console.log("");
      console.log("说明：扫描当前目录图片，读取属性后启动临时 Web 服务进行批量改名。");
      console.log("提示：请不要传任何参数。");
      return;
    }
    throw new Error("该命令不接受任何参数。请直接执行：image-sense");
  }

  const cwd = process.cwd();
  console.log(`开始扫描目录：${cwd}`);
  const { images } = await listImageFiles(cwd);
  if (images.length === 0) {
    console.error("未发现 jpg/png 图片文件。");
    process.exitCode = 1;
    return;
  }

  // 临时目录：用于记录 undo 日志等；退出时会尝试移入回收站（失败则删除）
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-sense-"));

  // 简单并发控制：避免一次性压爆本地模型
  const concurrency = 3;
  console.log(`发现 ${images.length} 张图片，开始识别（并发：${concurrency}）...`);
  /** @type {Array<{ filePath: string, analysis?: any, error?: unknown }>} */
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
        console.log(`[${current + 1}/${images.length}] 读取属性中：${fileName}`);
        const analysis = await analyzeImage(filePath);
        results[current] = { filePath, analysis };
        done += 1;
        console.log(
          `[${done}/${images.length}] 完成：${fileName} 属性：主体=${analysis.subject || "未知"} 场景=${analysis.scene || "未知"} 人数=${analysis.people || "未知"} 动作或互动=${analysis.action || "未知"} 宠物=${analysis.pet || "无"} 服装=${analysis.clothing || "未知"}`
        );
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

  // 组装 Web 状态
  /** @type {Array<any>} */
  const items = [];
  const defaultTemplate = {
    subject: true,
    scene: true,
    people: true,
    action: true,
    pet: true,
    clothing: true,
  };

  for (const r of results) {
    if (!r) continue;
    const name = path.basename(r.filePath);
    const ext = path.extname(name);
    const analysis = r.analysis;
    if (!analysis) continue;

    const attrs = {
      subject: analysis.subject || "",
      scene: analysis.scene || "",
      people: analysis.people || "",
      action: analysis.action || "",
      pet: analysis.pet || "",
      clothing: analysis.clothing || "",
    };

    items.push({
      name,
      ext,
      attrs,
      selected: true,
      targetBase: buildBaseNameFromAttrs(attrs, defaultTemplate),
    });
  }

  console.log("属性读取完成，启动临时 Web 服务...");
  const { server, url } = await startServer({ cwd, items, tempDir });
  console.log(`访问地址：${url}`);
  console.log("提示：按 Ctrl+C 退出服务。退出时会清理临时文件。");
  console.log(`耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  async function cleanup() {
    try {
      server.close();
    } catch {
      // 忽略：关闭失败不影响后续清理
    }

    // 最佳努力：macOS -> 回收站；其他系统 -> 直接删除
    try {
      const { default: trash } = await import("trash");
      await trash([tempDir]);
    } catch {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  let cleaned = false;
  async function onExit() {
    if (cleaned) return;
    cleaned = true;
    await cleanup();
    process.exit(0);
  }

  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
