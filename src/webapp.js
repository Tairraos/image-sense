/**
 * @fileoverview Web 单页应用：图片管理 + 模板生成 + 执行更名 + 输出 undo 命令。
 */

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
 *   name: string;      // 当前文件名（含扩展名）
 *   ext: string;       // 扩展名（含点）
 *   attrs: ImageAttrs; // 识别属性
 *   selected: boolean; // 是否勾选
 *   targetBase: string;// 目标文件名（无扩展名）
 * }} ImageItem
 */

/**
 * @param {{ cwd: string, items: ImageItem[] }} state
 * @returns {string}
 */
export function buildWebAppHtml(state) {
  const safeState = JSON.stringify(state).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>image-sense</title>
    <style>
      :root {
        --card: 320px;
        --gap: 30px;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
          Arial, "Noto Sans", "Liberation Sans", sans-serif;
        margin: 16px;
        color: #111827;
      }
      .top {
        position: sticky;
        top: 0;
        z-index: 10;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid #e5e7eb;
        padding: 10px 0 12px;
        margin-bottom: 16px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .label {
        color: #6b7280;
        font-size: 13px;
      }
      .btn {
        border: 1px solid #d1d5db;
        background: #fff;
        color: #111827;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
        user-select: none;
        font-size: 13px;
      }
      .btn.active {
        border-color: #2563eb;
        background: #2563eb;
        color: #fff;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, var(--card));
        column-gap: var(--gap);
        row-gap: 18px;
        align-items: start;
      }
      .card {
        width: var(--card);
      }
      .img-box {
        width: var(--card);
        height: var(--card);
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #f9fafb;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .img-box img {
        max-width: 320px;
        max-height: 320px;
        width: auto;
        height: auto;
        object-fit: contain;
      }
      .desc {
        margin-top: 8px;
        font-size: 13px;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .controls {
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .controls input[type="checkbox"] {
        transform: scale(1.35);
        transform-origin: left center;
      }
      .controls input[type="text"] {
        flex: 1;
        min-width: 0;
        border: 1px solid #d1d5db;
        border-radius: 10px;
        padding: 7px 10px;
        font-size: 13px;
      }
      .controls .ext {
        color: #6b7280;
        font-size: 12px;
      }
      .bottom {
        margin-top: 18px;
        border-top: 1px solid #e5e7eb;
        padding-top: 14px;
      }
      .primary {
        background: #16a34a;
        color: #fff;
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        cursor: pointer;
      }
      .primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .undo {
        margin-top: 12px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px;
        background: #0b1020;
        color: #e5e7eb;
        white-space: pre;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
          "Courier New", monospace;
        font-size: 12px;
        min-height: 60px;
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <div class="top">
      <div class="row" style="margin-bottom: 8px">
        <span class="label">选择图片：</span>
        <button class="btn" id="selectAll">全选</button>
        <button class="btn" id="selectNone">取消选择</button>
      </div>
      <div class="row">
        <span class="label">文件名模板：</span>
        <button class="btn active" data-t="subject">[主体]</button>
        <span class="label">-</span>
        <button class="btn active" data-t="scene">[场景]</button>
        <span class="label">-</span>
        <button class="btn active" data-t="people">[人数]</button>
        <span class="label">-</span>
        <button class="btn active" data-t="action">[动作或互动]</button>
        <span class="label">-</span>
        <button class="btn active" data-t="pet">[宠物]</button>
        <span class="label">-</span>
        <button class="btn active" data-t="clothing">[服装]</button>
      </div>
    </div>

    <div id="grid" class="grid"></div>

    <div class="bottom">
      <button id="execute" class="primary">执行更名</button>
      <div id="undo" class="undo" aria-label="undo 命令"></div>
    </div>

    <script>
      const state = ${safeState};
      const grid = document.getElementById("grid");
      const undo = document.getElementById("undo");
      const executeBtn = document.getElementById("execute");

      const template = {
        subject: true,
        scene: true,
        people: true,
        action: true,
        pet: true,
        clothing: true,
      };

      function sanitizePart(s) {
        return String(s || "")
          .trim()
          .replace(/[\\r\\n\\t]/g, "")
          .replace(/\\s+/g, "")
          .replace(/_+/g, "")
          .replace(/[\\/\\\\:*?"<>|]/g, "")
          .replace(/\\.+$/g, "");
      }

      function buildBaseName(attrs) {
        const parts = [];
        if (template.subject) parts.push(sanitizePart(attrs.subject));
        if (template.scene) parts.push(sanitizePart(attrs.scene));
        if (template.people) parts.push(sanitizePart(attrs.people));
        if (template.action) parts.push(sanitizePart(attrs.action));
        if (template.pet) parts.push(sanitizePart(attrs.pet));
        if (template.clothing) parts.push(sanitizePart(attrs.clothing));
        const out = parts.filter(Boolean).join("-");
        return out || "未命名";
      }

      function attrLine(attrs) {
        const a = {
          subject: attrs.subject || "未知",
          scene: attrs.scene || "未知",
          people: attrs.people || "未知",
          action: attrs.action || "未知",
          pet: attrs.pet || "无",
          clothing: attrs.clothing || "未知",
        };
        return [a.subject, a.scene, a.people, a.action, a.pet, a.clothing].join("-");
      }

      function applyTemplateToSelected() {
        for (const it of state.items) {
          if (!it.selected) continue;
          it.targetBase = buildBaseName(it.attrs);
        }
      }

      function render() {
        grid.innerHTML = "";
        for (const it of state.items) {
          const card = document.createElement("div");
          card.className = "card";

          const imgBox = document.createElement("div");
          imgBox.className = "img-box";
          const img = document.createElement("img");
          img.loading = "lazy";
          img.alt = it.name;
          img.src = "/img/" + encodeURIComponent(it.name);
          imgBox.appendChild(img);
          card.appendChild(imgBox);

          const desc = document.createElement("div");
          desc.className = "desc";
          desc.title = attrLine(it.attrs) + " [" + it.name + "]";
          desc.textContent = attrLine(it.attrs) + " [" + it.name + "]";
          card.appendChild(desc);

          const controls = document.createElement("div");
          controls.className = "controls";

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!it.selected;
          cb.addEventListener("change", () => {
            it.selected = cb.checked;
          });
          controls.appendChild(cb);

          const input = document.createElement("input");
          input.type = "text";
          input.value = it.targetBase || "";
          input.addEventListener("input", () => {
            it.targetBase = input.value;
          });
          controls.appendChild(input);

          const ext = document.createElement("span");
          ext.className = "ext";
          ext.textContent = it.ext;
          controls.appendChild(ext);

          card.appendChild(controls);
          grid.appendChild(card);
        }
      }

      function setAllSelected(val) {
        state.items.forEach((it) => (it.selected = val));
        render();
      }

      document.getElementById("selectAll").addEventListener("click", () => setAllSelected(true));
      document.getElementById("selectNone").addEventListener("click", () => setAllSelected(false));

      document.querySelectorAll("[data-t]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const k = btn.getAttribute("data-t");
          template[k] = !template[k];
          btn.classList.toggle("active", template[k]);
          applyTemplateToSelected();
          render();
        });
      });

      async function executeRename() {
        const payload = {
          items: state.items.map((it) => ({
            name: it.name,
            ext: it.ext,
            selected: !!it.selected,
            targetBase: String(it.targetBase || ""),
          })),
        };

        executeBtn.disabled = true;
        executeBtn.textContent = "执行中...";
        try {
          const resp = await fetch("/api/rename", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await resp.json();
          if (!resp.ok) {
            alert(data && data.message ? data.message : "执行失败");
            return;
          }

          undo.textContent = (data.undoLines || []).join("\\n");
          // 更新列表：更名后用新文件名继续管理
          for (const r of data.renamed || []) {
            const it = state.items.find((x) => x.name === r.oldName);
            if (!it) continue;
            it.name = r.newName;
            it.ext = r.ext;
            it.targetBase = r.newBase;
          }
          render();
        } finally {
          executeBtn.disabled = false;
          executeBtn.textContent = "执行更名";
        }
      }

      executeBtn.addEventListener("click", executeRename);

      // 初始化：根据默认模板生成一次目标名
      applyTemplateToSelected();
      render();
    </script>
  </body>
</html>`;
}
