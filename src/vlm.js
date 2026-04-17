/**
 * VLM 调用封装：把图片交给 OpenAI 兼容接口，拿到结构化结果。
 */

import fs from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";

import { loadLocalModelConfig } from "./config.js";
import { sanitizeToken, toPeopleCategory } from "./utils.js";

/**
 * @typedef {{
 *   subject: string;
 *   scene: string;
 *   people: "无人"|"单人"|"双人"|"多人";
 *   action: string;
 *   clothing: string;
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
    "要求：所有字段值使用中文、尽量简短，不要包含下划线，不要带句号/引号等多余标点。",
    "请根据图片内容填写以下字段：",
    "- subject：主体（例如：人物/猫咪/汽车/风景/建筑/食物…）",
    "- scene：场景（例如：室内/室外/办公室/街头/卧室/森林/花园/天空…）",
    "- personCount：图片中清晰可见的“人物”数量（整数；没有人物填 0；不确定填 0）",
    "- action：动作或互动（单人：站立/行走/坐姿/跑步/拍照…；多人：散步/喝茶/烘焙/园艺/依偎/荡秋千/做饭/拥抱/聊天/合影/插花/玩耍…；无人时可为空）",
    "- clothing：服装（尽量简洁；单人或多人都可填主角服装；无法判断可为空）",
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
  const personCount = Number(parsed.personCount ?? 0);
  return {
    subject: sanitizeToken(parsed.subject ?? ""),
    scene: sanitizeToken(parsed.scene ?? ""),
    people: toPeopleCategory(personCount),
    action: sanitizeToken(parsed.action ?? ""),
    clothing: sanitizeToken(parsed.clothing ?? ""),
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
