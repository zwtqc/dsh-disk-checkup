// 目录扫描的纯 Node 实现，主线程和 worker 线程共用。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function dirSize(p) {
  let total = 0
  const stack = [p]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(cur, e.name)
      if (e.isDirectory()) {
        stack.push(full)
        continue
      }
      try {
        total += fs.lstatSync(full).size
      } catch {}
    }
  }
  return total
}

export function childrenSize(p, filter) {
  let total = 0
  let entries
  try {
    entries = fs.readdirSync(p, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    if (filter && !filter(e)) continue
    const full = path.join(p, e.name)
    try {
      total += e.isDirectory() ? dirSize(full) : fs.lstatSync(full).size
    } catch {}
  }
  return total
}

export function volume(drive) {
  try {
    const s = fs.statfsSync(`${drive}\\`)
    const total = s.blocks * s.bsize
    const free = s.bavail * s.bsize
    if (total > 0) return { total, free, used: total - free }
  } catch {}
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `$v=Get-Volume -DriveLetter ${drive}; "$($v.Size) $($v.SizeRemaining)"`],
      { encoding: 'utf8', timeout: 20000 },
    )
    const [t, f] = out.trim().split(/\s+/).map(Number)
    if (t > 0) return { total: t, free: f, used: t - f }
  } catch {}
  return { total: 0, free: 0, used: 0 }
}

const USER = os.homedir()
const LOCAL = process.env.LOCALAPPDATA || path.join(USER, 'AppData', 'Local')
const ROAM = process.env.APPDATA || path.join(USER, 'AppData', 'Roaming')
const TEMP = process.env.TEMP || path.join(LOCAL, 'Temp')
const WIN = process.env.SystemRoot || 'C:\\Windows'
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
const PROGRAMDATA = process.env.ProgramData || 'C:\\ProgramData'

// 只列候选项，不算体积
export function catalogItems() {
  const items = []
  const add = (o) =>
    items.push({
      id: o.id,
      name: o.name,
      category: o.category,
      target: o.path,
      kind: o.kind,
      admin: !!o.admin,
      detail: o.detail,
      impact: o.impact,
      size: 0,
    })

  add({ id: 'temp_user', name: '用户临时文件', category: 'temp', path: TEMP, kind: 'children', detail: '各种程序运行时写的临时文件，安装包解压残留也在这里', impact: '无影响，正在运行的程序会重建自己需要的部分' })
  add({ id: 'crashdump', name: '程序崩溃转储', category: 'temp', path: path.join(LOCAL, 'CrashDumps'), kind: 'children', detail: '程序崩溃时生成的 .dmp 内存快照，用于排查问题', impact: '无影响；已发生的崩溃记录会消失' })
  add({ id: 'thumbcache', name: '缩略图缓存', category: 'browser', path: path.join(LOCAL, 'Microsoft', 'Windows', 'Explorer'), kind: 'thumbs', detail: '资源管理器为图片/视频生成的预览小图', impact: '无影响，缩略图会重新生成（首次浏览稍慢）' })
  add({ id: 'chrome_cache', name: 'Chrome 网页缓存', category: 'browser', path: path.join(LOCAL, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'), kind: 'children', detail: '网页图片、脚本的本地副本', impact: '首次打开常用网站略慢；书签、密码不受影响' })
  add({ id: 'chrome_code', name: 'Chrome 代码缓存', category: 'browser', path: path.join(LOCAL, 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache'), kind: 'children', detail: '浏览器编译过的 JS 字节码', impact: '首次加载网页稍慢，之后自动重建' })
  add({ id: 'edge_cache', name: 'Edge 缓存', category: 'browser', path: path.join(LOCAL, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'), kind: 'children', detail: 'Edge 的网页缓存', impact: '首次打开常用网站略慢；收藏夹不受影响' })
  add({ id: 'npm_cache', name: 'npm 缓存', category: 'package', path: path.join(LOCAL, 'npm-cache'), kind: 'dir', detail: 'npm 下载过的包存档', impact: '无影响；下次 npm install 会重新下载' })
  add({ id: 'wx_update', name: '微信升级补丁残留', category: 'app', path: path.join(ROAM, 'Tencent', 'xwechat', 'update'), kind: 'dir', detail: '微信历次升级用的补丁包残留', impact: '无影响；聊天记录不在这个目录里' })

  // ⚠️ 以下几类刻意不纳入自动删除，理由都和真实的翻车事故有关：
  //
  // 1) Chrome / Edge 的版本目录（Application\<版本号>\）
  //    根目录的 chrome.exe 是 stub，清单里写死依赖某个具体版本目录里的 <版本号>.manifest。
  //    当自动更新只下载了新 stub（new_chrome.exe）却没完成替换时，删掉旧版本目录里的
  //    manifest 会让浏览器报「应用程序的并行配置不正确」而完全打不开。
  //
  // 2) pnpm 的 store（%LOCALAPPDATA%\pnpm）
  //    它不是纯缓存：DSH profile 和各个项目的依赖是从这里链接出去的。整个删掉之后
  //    所有项目要重新安装依赖，且可能让正在使用的插件加载失败。要省空间请用
  //    `pnpm store prune`（只清理无引用的包）。
  //
  // 3) 应用更新器的待安装包（DSH 的 @deepseek-aidsh-desktop-updater\pending、
  //    DeepSeek Harness.new-{GUID}、EdgeUpdate\Install\{GUID}）
  //    里面可能是「已下载但还没装上」的下一个版本，删了等于取消这次更新。
  //
  // 4) 任何 <软件>\update 里正在下载/待应用的补丁 —— 只清理确认已过期的旧补丁。
  //
  // 旧版本 / 更新残留一律交给各软件自己的更新器处理，本插件不越权。

  add({ id: 'temp_win', name: 'Windows 临时文件', category: 'temp', path: path.join(WIN, 'Temp'), kind: 'children', admin: true, detail: '系统级临时文件，部分被 SYSTEM 占用', impact: '无影响，个别文件因占用会删除失败（正常）' })
  add({ id: 'wu_download', name: 'Windows 更新下载缓存', category: 'system', path: path.join(WIN, 'SoftwareDistribution', 'Download'), kind: 'children', admin: true, detail: '已经安装完成的 Windows 更新安装包', impact: '无影响；更新已装好，不需要这些包了' })
  add({ id: 'win_logs', name: 'Windows 日志', category: 'system', path: path.join(WIN, 'Logs'), kind: 'children', admin: true, detail: 'Windows 各组件写的历史日志', impact: '无影响；之后排查系统问题时可看的旧记录会少一些' })
  add({ id: 'wer', name: 'Windows 错误报告', category: 'system', path: path.join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER'), kind: 'children', admin: true, detail: '系统收集的崩溃报告队列', impact: '无影响' })
  add({ id: 'edgeupd_cache', name: 'Edge 更新下载缓存', category: 'browser', path: path.join(PF86, 'Microsoft', 'EdgeUpdate', 'Download'), kind: 'children', admin: true, detail: 'Edge 自动更新时下载的安装包（已装完的那份）', impact: '无影响；Edge 已更新完成' })

  return items
}

export function measureOne(it) {
  if (it.kind === 'thumbs') {
    it.size = childrenSize(it.target, (e) => /^thumbcache_.*\.db$/.test(e.name))
  } else if (it.kind === 'dir') {
    it.size = fs.existsSync(it.target) ? dirSize(it.target) : 0
  } else {
    it.size = childrenSize(it.target)
  }
  return it.size
}

// 面板里「不能删除」区块的内容。每条都对应一次真实事故或明确的机制原因。
// measure=false 表示目录太大/太危险，不主动统计体积（避免每次扫描都去遍历）。
const KEEP_ROWS = [
  {
    name: 'WinSxS 组件存储',
    path: path.join(WIN, 'WinSxS'),
    why: 'Windows 的组件仓库，删了系统无法更新、部分功能失效',
    how: '只能用 DISM /Online /Cleanup-Image /StartComponentCleanup 清理',
    measure: true,
  },
  {
    name: 'Windows\\Installer',
    path: path.join(WIN, 'Installer'),
    why: '已安装软件的卸载/修复数据包',
    how: '删了对应软件将无法卸载或修复',
    measure: true,
  },
  {
    name: 'System32',
    path: path.join(WIN, 'System32'),
    why: 'Windows 系统核心程序与驱动',
    how: '绝对不能删',
    measure: true,
  },
  {
    name: '浏览器版本目录（Chrome / Edge）',
    path: path.join(LOCAL, 'Google', 'Chrome', 'Application'),
    why: '浏览器根目录的 chrome.exe 是 stub，清单写死依赖某个版本目录里的 <版本号>.manifest。删掉旧版本目录会导致「应用程序的并行配置不正确」、浏览器完全打不开（本机 2026-11-22 真实发生过）',
    how: '交给浏览器自己的更新器清理，不要手动删',
    measure: false,
  },
  {
    name: 'pnpm store',
    path: path.join(LOCAL, 'pnpm'),
    why: '不是纯缓存：DSH 插件和各个项目的依赖从这里链接出去。整个删掉要全部重装依赖，还可能让正在使用的插件加载失败',
    how: '用 pnpm store prune（只清理无引用的包）',
    measure: true,
  },
  {
    name: '应用更新器的待安装包',
    path: path.join(LOCAL, '@deepseek-aidsh-desktop-updater'),
    why: '里面可能是「已下载但还没装上」的下一个版本，删了等于取消这次更新',
    how: '装完更新后由更新器自己清理',
    measure: false,
  },
  {
    name: 'DSH 配置与会话数据',
    path: path.join(USER, '.dsh'),
    why: 'DSH 的配置、插件、会话记录、记忆都在这里',
    how: '不要删；需要清理请用 DSH 自己的功能',
    measure: false,
  },
  {
    name: '驱动程序仓库 DriverStore',
    path: path.join(WIN, 'System32', 'DriverStore'),
    why: '所有已安装驱动的备份，删了外设/显卡可能失效且无法自动恢复',
    how: '不要删；空间紧张用「磁盘清理 → 设备驱动程序包」',
    measure: false,
  },
  {
    name: '已安装程序本体（Program Files）',
    path: process.env.ProgramFiles || 'C:\\Program Files',
    why: '这里是已安装软件的程序文件，不是缓存',
    how: '要卸载请走「设置 → 应用」，不要直接删目录',
    measure: false,
  },
  {
    name: '微信 / QQ 等聊天记录',
    path: path.join(USER, 'Documents'),
    why: '聊天数据库不在缓存目录里，删了就是永久丢失（本机 2026-11-21 因此丢过 11.8 GB）',
    how: '用聊天软件自己的「清理缓存」，不要删目录',
    measure: false,
  },
]

export function keepEntries(withSize) {
  return KEEP_ROWS.map((row) => {
    const canMeasure = withSize && row.measure !== false
    let size = 0
    if (canMeasure) {
      try {
        size = dirSize(row.path)
      } catch {
        size = 0
      }
    }
    return { name: row.name, why: row.why, how: row.how, path: row.path, size, sizeKnown: canMeasure }
  })
}

export { USER, LOCAL, ROAM, TEMP, WIN, PF86, PROGRAMDATA }
