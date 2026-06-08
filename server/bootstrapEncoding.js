/**
 * @file server/bootstrapEncoding.js
 * @description 控制台编码引导。Windows 控制台默认使用 GBK(936) 代码页，
 *   而 Node.js 向 stdout/stderr 写出的是 UTF-8 字节，二者不一致会导致中文 console 输出乱码。
 *   本模块在进程最早期（被 server.js 作为首个 import 引入）将控制台切到 UTF-8(65001)，
 *   使得直接 `node server.js` / `npm run server` 时也能正确显示中文（dev 脚本已自带 chcp 65001）。
 *
 *   注意：ESM 的 import 会被提升并按出现顺序求值，因此必须确保本文件是 server.js 的第一个 import，
 *   才能保证它先于其它会在导入期打印中文日志的模块执行。
 */
import { execSync } from 'child_process';

if (process.platform === 'win32') {
  try {
    // chcp 在共享的同一控制台上调用 SetConsoleOutputCP，对父 Node 进程后续输出同样生效
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 无 TTY（被 GUI/服务宿主拉起）或无权限时 chcp 会失败，此场景下本就不向控制台打印，忽略即可
  }
}
