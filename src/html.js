/**
 * @fileoverview 生成 rename.html：图片预览 + 可编辑新文件名 + 可复制 mv 命令。
 */

/**
 * @typedef {{
 *   oldName: string;
 *   newName: string;
 *   status: "ok" | "error" | "empty";
 *   note?: string;
 * }} RenameItem
 */

/**
 * @param {{ items: RenameItem[] }} params
 * @returns {string}
 */
export function buildRenameHtml(params) {
  const items = params.items ?? [];

  // 避免 </script> 之类的字符串把脚本提前截断
  const safeJson = JSON.stringify(items).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>image-sense 重命名预览</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
          Arial, "Noto Sans", "Liberation Sans", sans-serif;
        line-height: 1.5;
        margin: 16px;
        color: #111827;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 12px;
      }
      .meta {
        color: #6b7280;
        margin-bottom: 16px;
        font-size: 13px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 12px;
      }
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px;
      }
      .img-wrap {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #f9fafb;
        border-radius: 8px;
        padding: 8px;
      }
      img {
        max-width: 320px;
        max-height: 320px;
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: 6px;
      }
      .row {
        margin-top: 10px;
        font-size: 13px;
      }
      .label {
        color: #6b7280;
      }
      input[type="text"] {
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 14px;
      }
      input[type="text"]:disabled {
        background: #f3f4f6;
        color: #6b7280;
      }
      .note {
        margin-top: 8px;
        font-size: 12px;
        color: #ef4444;
      }
      .cmd-title {
        margin-top: 18px;
        font-size: 16px;
      }
      .cmd {
        margin-top: 10px;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px;
        background: #0b1020;
        color: #e5e7eb;
        white-space: pre;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
          "Courier New", monospace;
        font-size: 12px;
        overflow: auto;
      }
      .actions {
        margin-top: 10px;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      button {
        background: #2563eb;
        color: #fff;
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
      }
      button:active {
        transform: translateY(1px);
      }
      .toast {
        color: #10b981;
        font-size: 13px;
      }
      .warn {
        color: #f59e0b;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <h1>image-sense 重命名预览</h1>
    <div class="meta">提示：你可以在输入框里编辑“新文件名”，下方 mv 命令会自动更新。</div>

    <div id="grid" class="grid"></div>

    <div class="cmd-title">mv 命令</div>
    <div id="cmd" class="cmd"></div>
    <div class="actions">
      <button id="copy">复制命令</button>
      <span id="toast" class="toast" style="display:none">已复制</span>
      <span id="warn" class="warn"></span>
    </div>

    <script>
      const items = ${safeJson};

      const grid = document.getElementById("grid");
      const cmd = document.getElementById("cmd");
      const warn = document.getElementById("warn");
      const toast = document.getElementById("toast");
      const copyBtn = document.getElementById("copy");

      function escapeForDoubleQuote(s) {
        // 与 CLI 的输出格式保持一致：统一使用双引号包裹，内部双引号做转义
        return String(s).replaceAll("\\\\", "\\\\\\\\").replaceAll("\\"", "\\\\\\"");
      }

      function quote(s) {
        return '"' + escapeForDoubleQuote(s) + '"';
      }

      function buildCommands() {
        const lines = [];
        const nameCounter = new Map();
        for (const it of items) {
          if (it.status !== "ok") {
            lines.push("# 跳过：" + it.oldName + (it.note ? "（" + it.note + "）" : ""));
            continue;
          }
          const target = String(it.newName || "");
          nameCounter.set(target, (nameCounter.get(target) || 0) + 1);
          lines.push("mv " + quote(it.oldName) + " " + quote(target));
        }

        const duplicates = [];
        for (const [name, count] of nameCounter.entries()) {
          if (name && count > 1) duplicates.push(name);
        }
        warn.textContent = duplicates.length
          ? "注意：新文件名存在重复（建议手动调整）： " + duplicates.slice(0, 5).join("、") + (duplicates.length > 5 ? "..." : "")
          : "";

        cmd.textContent = lines.join("\\n");
      }

      function render() {
        grid.innerHTML = "";
        items.forEach((it) => {
          const card = document.createElement("div");
          card.className = "card";

          const imgWrap = document.createElement("div");
          imgWrap.className = "img-wrap";
          const img = document.createElement("img");
          img.alt = it.oldName;
          img.loading = "lazy";
          img.src = encodeURI(it.oldName);
          imgWrap.appendChild(img);
          card.appendChild(imgWrap);

          const rowOld = document.createElement("div");
          rowOld.className = "row";
          rowOld.innerHTML = '<span class="label">老文件名：</span>' + it.oldName;
          card.appendChild(rowOld);

          const rowNew = document.createElement("div");
          rowNew.className = "row";
          rowNew.innerHTML = '<span class="label">新文件名：</span>';
          const input = document.createElement("input");
          input.type = "text";
          input.value = it.newName || "";
          input.disabled = it.status !== "ok";
          input.addEventListener("input", () => {
            it.newName = input.value;
            buildCommands();
          });
          rowNew.appendChild(input);
          card.appendChild(rowNew);

          if (it.status !== "ok") {
            const note = document.createElement("div");
            note.className = "note";
            note.textContent = it.note ? it.note : "已跳过";
            card.appendChild(note);
          }

          grid.appendChild(card);
        });

        buildCommands();
      }

      async function copyAll() {
        try {
          await navigator.clipboard.writeText(cmd.textContent);
          toast.style.display = "inline";
          setTimeout(() => (toast.style.display = "none"), 1200);
        } catch (e) {
          // fallback：旧浏览器
          const ta = document.createElement("textarea");
          ta.value = cmd.textContent;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          toast.style.display = "inline";
          setTimeout(() => (toast.style.display = "none"), 1200);
        }
      }

      copyBtn.addEventListener("click", copyAll);
      render();
    </script>
  </body>
</html>`;
}
