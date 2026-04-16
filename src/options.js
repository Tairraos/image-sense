/**
 * 解析 CLI 参数。
 *
 * 规则：
 * - -c/-p/-b/-n：出现顺序即新文件名各词顺序
 * - -s 'name'：保存到文件；若未提供 name，则保存到 rename.sh
 * - -r：自动执行更名；启用后会强制写入 rename.sh 作为日志
 * - 默认行为：未出现任何（除 -s 以外的）文件名参数时，启用默认命名规则
 */

/**
 * @typedef {"c"|"p"|"b"|"n"} TokenFlag
 */

/**
 * @param {string[]} argv
 * @returns {{ tokenOrder: TokenFlag[], saveFileName: string | null }}
 */
export function getCliOptions(argv) {
  /** @type {TokenFlag[]} */
  const tokenOrder = [];
  let saveFileName = null;
  let autoRename = false;

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "-c") tokenOrder.push("c");
    else if (a === "-p") tokenOrder.push("p");
    else if (a === "-b") tokenOrder.push("b");
    else if (a === "-n") tokenOrder.push("n");
    else if (a === "-s") {
      const maybeName = args[i + 1];
      if (maybeName && !maybeName.startsWith("-")) {
        saveFileName = maybeName;
        i += 1;
      } else {
        saveFileName = "rename.sh";
      }
    } else if (a === "-r") {
      autoRename = true;
    } else {
      throw new Error(`未知参数：${a}`);
    }
  }

  return { tokenOrder, saveFileName, autoRename };
}
