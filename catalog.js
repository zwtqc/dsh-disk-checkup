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
  add({ id: 'pnpm_store', name: 'pnpm 包缓存', category: 'package', path: path.join(LOCAL, 'pnpm'), kind: 'dir', detail: 'npm 包的统一存储，供多个项目共享', impact: '已装好的项目不受影响；下次安装依赖时需要重新下载' })
  add({ id: 'npm_cache', name: 'npm 缓存', category: 'package', path: path.join(LOCAL, 'npm-cache'), kind: 'dir', detail: 'npm 下载过的包存档', impact: '无影响；下次 npm install 会重新下载' })
  add({ id: 'dsh_pending', name: 'DSH 更新包残留', category: 'app', path: path.join(LOCAL, '@deepseek-aidsh-desktop-updater', 'pending'), kind: 'dir', detail: 'DeepSeek Harness 已安装完的更新安装包', impact: '无影响，版本已经是新的' })
  add({ id: 'wx_update', name: '微信升级补丁残留', category: 'app', path: path.join(ROAM, 'Tencent', 'xwechat', 'update'), kind: 'dir', detail: '微信历次升级用的补丁包残留', impact: '无影响；聊天记录不在这个目录里' })

  // ⚠️ 刻意不扫描 Chrome 的版本目录（Application\<版本号>\）：
  // 根目录的 chrome.exe 是一个 stub，它的清单里写死依赖某一个具体版本目录。
  // 当 Chrome 的自动更新只下载了新 stub（new_chrome.exe）却没完成替换时，
  // 删掉旧版本目录里的 *.manifest 会让 Chrome 直接报
  // 「应用程序的并行配置不正确 / Dependent Assembly x.y.z.w could not be found」。
  // 旧版本由 Chrome 自己的更新器清理，这里不碰。

  const programs = path.join(LOCAL, 'Programs')
  try {
    for (const e of fs.readdirSync(programs, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('DeepSeek Harness.new-')) {
        add({ id: `olddsh:${e.name}`, name: 'DSH 旧版本目录', category: 'app', path: path.join(programs, e.name), kind: 'dir', detail: 'Harness 升级时留下的旧版本程序目录', impact: '无影响，当前版本可正常运行' })
      }
    }
  } catch {}

  add({ id: 'temp_win', name: 'Windows 临时文件', category: 'temp', path: path.join(WIN, 'Temp'), kind: 'children', admin: true, detail: '系统级临时文件，部分被 SYSTEM 占用', impact: '无影响，个别文件因占用会删除失败（正常）' })
  add({ id: 'wu_download', name: 'Windows 更新下载缓存', category: 'system', path: path.join(WIN, 'SoftwareDistribution', 'Download'), kind: 'children', admin: true, detail: '已经安装完成的 Windows 更新安装包', impact: '无影响；更新已装好，不需要这些包了' })
  add({ id: 'win_logs', name: 'Windows 日志', category: 'system', path: path.join(WIN, 'Logs'), kind: 'children', admin: true, detail: 'Windows 各组件写的历史日志', impact: '无影响；之后排查系统问题时可看的旧记录会少一些' })
  add({ id: 'wer', name: 'Windows 错误报告', category: 'system', path: path.join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER'), kind: 'children', admin: true, detail: '系统收集的崩溃报告队列', impact: '无影响' })
  add({ id: 'edgeupd_cache', name: 'Edge 更新下载缓存', category: 'browser', path: path.join(PF86, 'Microsoft', 'EdgeUpdate', 'Download'), kind: 'children', admin: true, detail: 'Edge 自动更新时下载的安装包', impact: '无影响；Edge 已更新完成' })

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

const KEEP_ROWS = [
  ['WinSxS 组件存储', 'WinSxS', 'Windows 的组件仓库，删了系统无法更新、部分功能失效', '只能用 DISM /Online /Cleanup-Image /StartComponentCleanup 清理'],
  ['Windows\\Installer', 'Installer', '已安装软件的卸载/修复数据包', '删了对应软件将无法卸载或修复'],
  ['System32', 'System32', 'Windows 系统核心程序与驱动', '绝对不能删'],
]

export function keepEntries(withSize) {
  return KEEP_ROWS.map(([name, dir, why, how]) => {
    const target = path.join(WIN, dir)
    return { name, why, how, path: target, size: withSize ? dirSize(target) : 0, sizeKnown: !!withSize }
  })
}

export { USER, LOCAL, ROAM, TEMP, WIN, PF86, PROGRAMDATA }
