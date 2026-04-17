/**
 * 扫描目录图片。
 */

import fs from "node:fs/promises";
import path from "node:path";

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
