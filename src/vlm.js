/**
 * VLM 调用封装：把图片交给 OpenAI 兼容接口，拿到结构化结果。
 */

import fs from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";

import { loadLocalModelConfig } from "./config.js";

/**
 * @typedef {{
 *   personCount: number;
 *   pose: string;
 *   clothing: string;
 *   behavior: string;
 * }} ImageAnalysis
 */

let _clientPromise = null;

/**
 * @returns {Promise<{ client: OpenAI, model: string }>}
 */
async function getClient() {
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    const cfg = await loadLocalModelConfig();
    const client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    });
    return { client, model: cfg.model };
  })();
  return _clientPromise;
}

/**
 * @param {string} filePath 图片绝对路径
 * @returns {Promise<ImageAnalysis>}
 */
export async function analyzeImage(filePath) {
  const { client, model } = await getClient();

  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  const buf = await fs.readFile(filePath);
  const base64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  const prompt = [
    "你是一个用于图片重命名的视觉助手。",
    "请严格只输出一个 JSON 对象，不要输出任何额外文字。",
    "要求：所有字段值使用中文、尽量简短、不要包含下划线、不要带句号/引号等多余标点。",
    "请根据图片内容填写：",
    "- personCount：图片中清晰可见的人物数量（整数，无法判断则填 0）",
    "- pose：主要人物的姿势词（例如：下蹲、比心、举手、回头等）；多人时可为空",
    "- clothing：主要人物穿着（如果是 cosplay 服装可用“超人装/女仆装”等；日常衣服用颜色+款式，如“黑色夹克/白色运动衫”）；无法判断可为空",
    "- behavior：人物正在进行的活动/行为（例如：跑步、园艺活动、合影、对话、打球等）；单人也要填（尽量给一个动词短语）；无法判断可为空",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "你是严谨的 JSON 生成器。" },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const text = resp.choices?.[0]?.message?.content ?? "";
  const json = extractJsonObject(text);

  /** @type {any} */
  const parsed = JSON.parse(json);
  return {
    personCount: Number(parsed.personCount ?? 0),
    pose: String(parsed.pose ?? ""),
    clothing: String(parsed.clothing ?? ""),
    behavior: String(parsed.behavior ?? ""),
  };
}

/**
 * 从模型输出中提取第一个 JSON 对象（防御性）。
 *
 * @param {string} text
 * @returns {string}
 */
function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`模型输出无法解析为 JSON：${text}`);
  }
  return text.slice(start, end + 1);
}
