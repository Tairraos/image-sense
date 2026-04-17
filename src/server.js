/**
 * @fileoverview 临时 Web 服务：提供图片浏览/编辑/执行更名接口。
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";

import { sanitizeFileBaseName } from "./utils.js";
import { buildWebAppHtml } from "./webapp.js";

/**
 * @typedef {{
 *   subject: string;
 *   scene: string;
 *   people: string;
 *   action: string;
 *   pet: string;
 *   clothing: string;
 * }} ImageAttrs
 */

/**
 * @typedef {{
 *   name: string;
 *   ext: string;
 *   attrs: ImageAttrs;
 *   selected: boolean;
 *   targetBase: string;
 * }} ImageItem
 */

/**
 * @param {string} fileName
 * @returns {string}
 */
function guessContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

/**
 * @param {http.ServerResponse} res
 * @param {number} code
 * @param {any} obj
 */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 2 * 1024 * 1024) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text || "{}");
}

/**
 * @param {string} desiredNameWithExt
 * @param {Set<string>} reservedNames
 * @returns {string}
 */
function toUniqueName(desiredNameWithExt, reservedNames) {
  const ext = path.extname(desiredNameWithExt);
  const base = desiredNameWithExt.slice(0, -ext.length);

  if (!reservedNames.has(desiredNameWithExt)) {
    reservedNames.add(desiredNameWithExt);
    return desiredNameWithExt;
  }

  let i = 1;
  while (true) {
    const candidate = `${base}_${i}${ext}`;
    if (!reservedNames.has(candidate)) {
      reservedNames.add(candidate);
      return candidate;
    }
    i += 1;
  }
}

/**
 * @param {{ cwd: string, items: ImageItem[], tempDir: string }} params
 * @returns {Promise<{ server: http.Server, url: string }>}
 */
export async function startServer(params) {
  const cwd = params.cwd;
  /** @type {ImageItem[]} */
  const items = params.items;
  const tempDir = params.tempDir;
  const undoPath = path.join(tempDir, "undo.log");

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = u.pathname;

      if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        const html = buildWebAppHtml({ cwd, items });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && pathname === "/api/state") {
        sendJson(res, 200, { cwd, items });
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/img/")) {
        const raw = pathname.slice("/img/".length);
        const name = decodeURIComponent(raw);
        if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
          res.writeHead(400);
          res.end("bad request");
          return;
        }

        // 只允许访问当前列表里的文件（避免任意文件读取）
        if (!items.some((it) => it.name === name)) {
          res.writeHead(404);
          res.end("not found");
          return;
        }

        const abs = path.join(cwd, name);
        const st = await fsp.stat(abs).catch(() => null);
        if (!st || !st.isFile()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }

        res.writeHead(200, { "content-type": guessContentType(name) });
        fs.createReadStream(abs).pipe(res);
        return;
      }

      if (req.method === "POST" && pathname === "/api/rename") {
        const body = await readJsonBody(req);
        const reqItems = Array.isArray(body.items) ? body.items : [];

        /** @type {Set<string>} */
        const reserved = new Set(await fsp.readdir(cwd));

        const selected = reqItems
          .filter((x) => x && x.selected)
          .map((x) => ({
            oldName: String(x.name || ""),
            targetBase: sanitizeFileBaseName(String(x.targetBase || "")),
          }))
          .filter((x) => x.oldName);

        if (selected.length === 0) {
          sendJson(res, 200, { renamed: [], undoLines: [] });
          return;
        }

        const renamed = [];
        const undoLines = [];

        console.log(`开始执行更名（共 ${selected.length} 张）...`);
        for (let i = 0; i < selected.length; i += 1) {
          const it = selected[i];
          const oldAbs = path.join(cwd, it.oldName);

          const ext = path.extname(it.oldName);
          const base = it.targetBase || "未命名";
          const desired = `${base}${ext}`;
          const unique = toUniqueName(desired, reserved);

          if (unique === it.oldName) {
            console.log(`跳过(${i + 1}/${selected.length})：${it.oldName}（无变化）`);
            continue;
          }

          const newAbs = path.join(cwd, unique);
          console.log(`改名(${i + 1}/${selected.length})：${it.oldName} -> ${unique}`);
          await fsp.rename(oldAbs, newAbs);

          const undo = `mv "${unique}" "${it.oldName}"`;
          undoLines.push(undo);
          await fsp.appendFile(undoPath, undo + os.EOL, "utf8").catch(() => {});

          // 更新内存状态：后续页面继续管理新文件名
          const mem = items.find((x) => x.name === it.oldName);
          if (mem) {
            mem.name = unique;
            mem.ext = ext;
            mem.targetBase = unique.slice(0, -ext.length);
          }

          renamed.push({
            oldName: it.oldName,
            newName: unique,
            ext,
            newBase: unique.slice(0, -ext.length),
          });
        }

        sendJson(res, 200, { renamed, undoLines });
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch (err) {
      sendJson(res, 500, { message: err?.message || String(err) });
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { server, url: `http://127.0.0.1:${port}/` };
}
