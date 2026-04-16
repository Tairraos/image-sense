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
 * @param {number} count
 * @returns {string}
 */
export function toPeopleCountWord(count) {
  if (!Number.isFinite(count) || count <= 0) return "未知人数";
  if (count === 1) return "单人";
  if (count === 2) return "双人";
  if (count === 3) return "三人";
  if (count === 4) return "四人";
  if (count === 5) return "五人";

  const zh = toChineseNumber(count);
  return zh ? `${zh}人` : `${count}人`;
}

/**
 * @param {number} n
 * @returns {string}
 */
function toChineseNumber(n) {
  const map = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (!Number.isInteger(n) || n < 0) return "";
  if (n < 10) return map[n];
  if (n < 20) return n === 10 ? "十" : `十${map[n % 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? `${map[tens]}十` : `${map[tens]}十${map[ones]}`;
  }
  return "";
}
