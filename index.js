// Host half: 磁盘体检 HTTP 路由。扫描放在 worker 线程，主线程始终可响应。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { volume, catalogItems, dirSize } from './catalog.js'

export const inject = ['webServer']

const CACHE_FILE = path.join(os.tmpdir(), 'dsh-disk-checkup-cache.json')
const LOG_FILE = path.join(os.tmpdir(), 'dsh-disk-checkup-requests.log')
const CACHE_VERSION = 4
const CACHE_TTL_MS = 30 * 60 * 1000
const SCAN_TIMEOUT_MS = 180000

function logLine(msg) {
  try {
    const line = `${new Date().toISOString()} ${msg}\n`
    fs.appendFileSync(LOG_FILE, line)
    if (fs.statSync(LOG_FILE).size > 256 * 1024) fs.writeFileSync(LOG_FILE, line)
  } catch {}
}

let mem = null
let memAt = 0
let scanning = false

// ---------- worker 扫描 ----------
function runWorkerScan(full, onProgress) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let settled = false
    let payload = null
    let worker
    try {
      worker = new Worker(new URL('./scanner.js', import.meta.url), { workerData: { full: !!full } })
    } catch (e) {
      reject(e)
      return
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        worker.terminate()
      } catch {}
      reject(new Error('扫描超时'))
    }, SCAN_TIMEOUT_MS)

    worker.on('message', (m) => {
      if (m && m.type === 'progress' && onProgress) onProgress(m.done, m.total, m.current)
      else if (m && m.type === 'done') payload = m
    })
    worker.on('error', (e) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(e)
    })
    worker.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) return reject(new Error('扫描线程退出码 ' + code))
      if (!payload) return reject(new Error('扫描没有返回结果'))
      resolve({ items: payload.items || [], keep: payload.keep || [], ms: Date.now() - started })
    })
  })
}

function buildReport(payload) {
  const items = payload.items || []
  const freeable = items.reduce((n, it) => n + it.size, 0)
  const adminSize = items.filter((i) => i.admin).reduce((n, it) => n + it.size, 0)
  return {
    at: new Date().toISOString(),
    c: volume('C'),
    d: volume('D'),
    items,
    freeable,
    adminSize,
    userSize: freeable - adminSize,
    uptimeDays: os.uptime() / 86400,
    keep: payload.keep || [],
    scanMs: payload.ms || 0,
  }
}

// ---------- 缓存 ----------
function readDiskCache() {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    if (!j || j.v !== CACHE_VERSION || !j.at) return
    if (!j.c || !j.c.total) return
    mem = j
    memAt = Date.parse(j.at) || 0
  } catch {}
}

function writeDiskCache(d) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ v: CACHE_VERSION, ...d }))
  } catch {}
}

function store(d) {
  mem = d
  memAt = Date.now()
  writeDiskCache(d)
  return d
}

function invalidate() {
  mem = null
  memAt = 0
  try {
    fs.rmSync(CACHE_FILE, { force: true })
  } catch {}
}

function refreshInBackground(full) {
  if (scanning) return
  scanning = true
  runWorkerScan(full, null)
    .then((p) => store(buildReport(p)))
    .catch(() => {})
    .finally(() => {
      scanning = false
    })
}

// ---------- 带进度的扫描状态 ----------
let scanState = null

function startScan(full) {
  if (scanState && !scanState.finished) return scanState
  const id = 's' + Date.now().toString(36)
  scanState = {
    id,
    done: 0,
    total: 1,
    current: '启动中…',
    startedAt: Date.now(),
    finished: false,
    error: null,
    report: null,
  }
  const st = scanState
  scanning = true
  runWorkerScan(full, (done, total, current) => {
    st.done = done
    st.total = total
    st.current = current
  })
    .then((p) => {
      const rep = store(buildReport(p))
      st.done = st.total
      st.current = '完成'
      st.report = rep
      st.finished = true
      logLine(`scan DONE ms=${rep.scanMs} items=${rep.items.length} free=${(rep.c.free / 1024 ** 3).toFixed(2)}GB`)
    })
    .catch((e) => {
      st.error = String((e && e.message) || e)
      st.finished = true
      logLine(`scan FAILED ${st.error}`)
    })
    .finally(() => {
      scanning = false
    })
  return st
}

// ---------- 删除 ----------
function rmEntry(full) {
  let size = 0
  try {
    const st = fs.lstatSync(full)
    size = st.isDirectory() ? dirSize(full) : st.size
  } catch {}
  try {
    fs.rmSync(full, { recursive: true, force: true })
    return { freed: size, ok: true }
  } catch {
    return { freed: 0, ok: false }
  }
}

function removeItem(it) {
  let freed = 0
  let locked = 0
  if (it.kind === 'dir') {
    const r = rmEntry(it.target)
    return { freed: r.freed, locked: r.ok ? 0 : 1 }
  }
  let entries = []
  try {
    entries = fs.readdirSync(it.target, { withFileTypes: true })
  } catch {
    return { freed: 0, locked: 1 }
  }
  const filter = it.kind === 'thumbs' ? (e) => /^thumbcache_.*\.db$/.test(e.name) : null
  for (const e of entries) {
    if (filter && !filter(e)) continue
    const r = rmEntry(path.join(it.target, e.name))
    freed += r.freed
    if (!r.ok) locked++
  }
  return { freed, locked }
}

function clean(ids) {
  const picked = catalogItems().filter((it) => ids.includes(it.id))
  const done = []
  const failed = []
  let freed = 0
  for (const it of picked) {
    const r = removeItem(it)
    freed += r.freed
    if (r.freed > 0 || r.locked === 0) done.push({ id: it.id, name: it.name, freed: r.freed })
    if (r.locked > 0) {
      failed.push({
        id: it.id,
        name: it.name,
        reason:
          (r.freed > 0 ? '部分文件' : '文件') +
          '被占用' +
          (it.admin ? '（需要管理员权限）' : '（关掉占用它的程序后可再试）'),
      })
    }
  }
  invalidate()
  return { done, failed, freed, c: volume('C') }
}

// ---------- HTTP ----------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

export function apply(ctx) {
  readDiskCache()

  // 快照：有缓存就立刻返回，没有就等一次 worker 扫描
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-disk-checkup/report',
      handler: async (req, res) => {
        try {
          const q = new URL(req.url || '/', 'http://localhost').searchParams
          const force = q.get('force') === '1'
          const full = q.get('full') === '1'
          const now = Date.now()
          if (!force && mem && now - memAt < CACHE_TTL_MS) {
            const d = { ...mem, cached: true, stale: false, cachedAgeMs: now - memAt }
            logLine(`report cached=true items=${d.items.length} free=${(d.c.free / 1024 ** 3).toFixed(2)}GB`)
            sendJson(res, 200, d)
            return
          }
          if (!force && mem) {
            refreshInBackground(full)
            const d = { ...mem, cached: true, stale: true, cachedAgeMs: now - memAt }
            logLine(`report cached=true(stale) items=${d.items.length}`)
            sendJson(res, 200, d)
            return
          }
          const rep = buildReport(await runWorkerScan(full, null))
          store(rep)
          logLine(`report fresh items=${rep.items.length} free=${(rep.c.free / 1024 ** 3).toFixed(2)}GB`)
          sendJson(res, 200, { ...rep, cached: false, stale: false, cachedAgeMs: 0 })
        } catch (err) {
          const msg = String((err && err.message) || err)
          logLine(`report FAILED ${msg}`)
          sendJson(res, 500, { error: msg })
        }
      },
    }),
  )

  // 启动一次带进度的扫描（立刻返回，不阻塞）
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-disk-checkup/scan',
      handler: (req, res) => {
        try {
          const q = new URL(req.url || '/', 'http://localhost').searchParams
          const st = startScan(q.get('full') === '1')
          logLine(`scan START id=${st.id}`)
          sendJson(res, 200, { id: st.id, total: st.total })
        } catch (err) {
          sendJson(res, 500, { error: String((err && err.message) || err) })
        }
      },
    }),
  )

  // 轮询进度（主线程不被占用，所以能及时响应）
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-disk-checkup/progress',
      handler: (req, res) => {
        try {
          const st = scanState
          if (!st) {
            sendJson(res, 200, { finished: false, done: 0, total: 1, current: '未开始', percent: 0 })
            return
          }
          const percent = st.total ? Math.min(100, Math.round((st.done / st.total) * 100)) : 0
          const out = {
            id: st.id,
            done: st.done,
            total: st.total,
            current: st.current,
            percent,
            finished: st.finished,
            error: st.error,
            elapsedMs: Date.now() - st.startedAt,
          }
          if (st.finished && st.report) out.report = { ...st.report, cached: false, stale: false, cachedAgeMs: 0 }
          sendJson(res, 200, out)
        } catch (err) {
          sendJson(res, 500, { error: String((err && err.message) || err) })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-disk-checkup/clean',
      handler: async (req, res) => {
        try {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, CORS)
            res.end()
            return
          }
          const q = new URL(req.url || '/', 'http://localhost').searchParams
          let ids = (q.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean)
          if (req.method === 'POST') {
            const body = await readBody(req)
            if (Array.isArray(body.ids) && body.ids.length) ids = body.ids.map(String)
          }
          if (!ids.length) {
            logLine(`clean REJECTED (no ids) method=${req.method}`)
            sendJson(res, 400, { error: 'no ids' })
            return
          }
          logLine(`clean REQUEST method=${req.method} ids=${ids.join(',')}`)
          const out = clean(ids)
          logLine(
            `clean DONE ok=${out.done.length} failed=${out.failed.length} freed=${(out.freed / 1024 ** 2).toFixed(1)}MB free=${(out.c.free / 1024 ** 3).toFixed(2)}GB`,
          )
          sendJson(res, 200, out)
        } catch (err) {
          sendJson(res, 500, { error: String((err && err.message) || err) })
        }
      },
    }),
  )
}
