/**
 * 从环境变量或 ~/.zshrc 读取本地 OpenAI 兼容模型配置。
 *
 * 注意：不会把任何密钥写入工程文件。
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * @typedef {{
 *   apiKey: string;
 *   baseUrl: string;
 *   model: string;
 * }} LocalModelConfig
 */

/**
 * @returns {Promise<LocalModelConfig>}
 */
export async function loadLocalModelConfig() {
  const env = {
    LOCAL_API_KEY: process.env.LOCAL_API_KEY,
    LOCAL_BASE_URL: process.env.LOCAL_BASE_URL,
    LOCAL_MODEL: process.env.LOCAL_MODEL,
  };

  if (env.LOCAL_API_KEY && env.LOCAL_BASE_URL && env.LOCAL_MODEL) {
    return {
      apiKey: env.LOCAL_API_KEY,
      baseUrl: env.LOCAL_BASE_URL,
      model: env.LOCAL_MODEL,
    };
  }

  const zshrcPath = path.join(os.homedir(), ".zshrc");
  const fromZshrc = await readLocalVarsFromZshrc(zshrcPath);

  const apiKey = env.LOCAL_API_KEY || fromZshrc.LOCAL_API_KEY;
  const baseUrl = env.LOCAL_BASE_URL || fromZshrc.LOCAL_BASE_URL;
  const model = env.LOCAL_MODEL || fromZshrc.LOCAL_MODEL;

  if (!apiKey || !baseUrl || !model) {
    throw new Error(
      [
        "缺少本地模型配置。请通过环境变量或 ~/.zshrc 提供：",
        '  LOCAL_API_KEY="..."',
        '  LOCAL_BASE_URL="http://127.0.0.1:8086/v1"',
        '  LOCAL_MODEL="..."',
      ].join("\n")
    );
  }

  return { apiKey, baseUrl, model };
}

/**
 * 只做极简解析：匹配形如
 * - export LOCAL_API_KEY="xxx"
 * - LOCAL_BASE_URL='http://...'
 *
 * @param {string} filePath
 * @returns {Promise<Record<string, string>>}
 */
async function readLocalVarsFromZshrc(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    /** @type {Record<string, string>} */
    const out = {};
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(
        /^\s*(?:export\s+)?(LOCAL_API_KEY|LOCAL_BASE_URL|LOCAL_MODEL)\s*=\s*(?:(["'])(.*?)\2|(.*?))\s*$/
      );
      if (!m) continue;
      const key = m[1];
      const value = (m[3] ?? m[4] ?? "").trim();
      if (value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}
