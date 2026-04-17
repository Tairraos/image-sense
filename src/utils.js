/**
 * 一些通用工具：词条清洗、人数中文词等。
 */

/**
 * 清洗模型输出的单个“词”：
 * - 去掉首尾空白
 * - 移除下划线与多余空白（避免和我们自己的连接规则冲突）
 * - 移除 macOS 文件名不允许/不建议的字符
 *
 * @param {string} input
 * @returns {string}
 */
export function sanitizeToken(input) {
  if (!input) return "";
  return String(input)
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/\s+/g, "")
    .replace(/_+/g, "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\.+$/g, ""); // 避免以点结尾（Finder 表现怪异）
}

/**
 * 人数维度：无人 / 单人 / 双人 / 多人。
 *
 * @param {number} count
 * @returns {"无人"|"单人"|"双人"|"多人"}
 */
export function toPeopleCategory(count) {
  const n = Number.isFinite(count) ? count : 0;
  if (n <= 0) return "无人";
  if (n === 1) return "单人";
  if (n === 2) return "双人";
  return "多人";
}

/**
 * 文件名安全化（“段”级别）：允许中文、英文、数字、连字符等，
 * 但会移除 macOS 不允许/不建议的字符，并清理首尾空白/点号。
 *
 * @param {string} input
 * @returns {string}
 */
export function sanitizeFileBaseName(input) {
  if (!input) return "";
  return String(input)
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

/**
 * 根据模板生成“无扩展名”的目标文件名。
 *
 * @param {{
 *   subject: string,
 *   scene: string,
 *   people: string,
 *   action: string,
 *   pet: string,
 *   clothing: string
 * }} attrs
 * @param {{ subject: boolean, scene: boolean, people: boolean, action: boolean, pet: boolean, clothing: boolean }} template
 * @returns {string}
 */
export function buildBaseNameFromAttrs(attrs, template) {
  const parts = [];
  if (template.subject) parts.push(sanitizeToken(attrs.subject));
  if (template.scene) parts.push(sanitizeToken(attrs.scene));
  if (template.people) parts.push(sanitizeToken(attrs.people));
  if (template.action) parts.push(sanitizeToken(attrs.action));
  if (template.pet) parts.push(sanitizeToken(attrs.pet));
  if (template.clothing) parts.push(sanitizeToken(attrs.clothing));

  const out = parts.filter(Boolean).join("-");
  return out || "未命名";
}
