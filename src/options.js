/**
 * 解析 CLI 参数。
 *
 * 规则：
 * - -c/-p/-b/-n：出现顺序即新文件名各词顺序
 * - --html：生成 rename.html（可预览图片、编辑新文件名、复制 mv 命令）
 * - 默认行为：未出现任何（除 -s 以外的）文件名参数时，启用默认命名规则
 */

/**
 * @typedef {"c"|"p"|"b"|"n"} TokenFlag
 */

/**
 * @param {string[]} argv
 * @returns {{ tokenOrder: TokenFlag[], html: boolean }}
 */
export function getCliOptions(argv) {
  /** @type {TokenFlag[]} */
  const tokenOrder = [];
  let html = false;

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "-c") tokenOrder.push("c");
    else if (a === "-p") tokenOrder.push("p");
    else if (a === "-b") tokenOrder.push("b");
    else if (a === "-n") tokenOrder.push("n");
    else if (a === "--html") html = true;
    else {
      throw new Error(`未知参数：${a}`);
    }
  }

  return { tokenOrder, html };
}
