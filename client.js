// Client half: a left-sidebar entry plus the report panel it opens.
window.__ModuleLoader__.load({
  id: 'dsh-disk-checkup',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

    const PANEL_ID = 'disk-checkup'
    const BASE = '/dsh-disk-checkup'

    const CATS = [
      { key: 'all', label: '全部', color: '#2f6fed' },
      { key: 'temp', label: '临时文件', color: '#0ea5e9' },
      { key: 'browser', label: '浏览器', color: '#8b5cf6' },
      { key: 'package', label: '包缓存', color: '#f59e0b' },
      { key: 'app', label: '旧版本', color: '#10b981' },
      { key: 'system', label: '系统', color: '#ef4444' },
      { key: 'software', label: '软件残留', color: '#64748b' },
    ]

    const CSS = `
.dc-root{
  box-sizing:border-box; height:100%; max-height:100vh; min-height:0;
  overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;
  padding:0 0 84px; background:var(--dc-bg); color:var(--dc-text);
  --dc-bg:#f6f8fc; --dc-card:#ffffff; --dc-line:#e3e9f5; --dc-text:#1f2937;
  --dc-sub:#6b7280; --dc-blue:#2f6fed; --dc-blue-deep:#1b4fd8; --dc-soft:#eef4ff;
}
body[data-ds-dark-theme] .dc-root{
  --dc-bg:#0f172a; --dc-card:#17233c; --dc-line:#27344f; --dc-text:#e5ecf8;
  --dc-sub:#93a4c0; --dc-blue:#5b9dff; --dc-blue-deep:#3b7bff; --dc-soft:#1b2b4a;
}
.dc-scroll{max-width:920px;margin:0 auto;padding:0 20px}
.dc-hero{
  background:linear-gradient(135deg,var(--dc-blue) 0%,var(--dc-blue-deep) 100%);
  color:#fff;border-radius:0 0 18px 18px;padding:22px 24px 26px;margin-bottom:18px;
}
.dc-hero-top{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.dc-hero-title{font-size:18px;font-weight:700;letter-spacing:.3px}
.dc-hero-sub{font-size:12px;opacity:.82}
.dc-hero-body{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.dc-metrics{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(140px,1fr));flex:1}
.dc-metric{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:10px 12px}
.dc-metric-k{font-size:11px;opacity:.85;margin-bottom:4px}
.dc-metric-v{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.dc-btn{
  border:none;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;
  background:var(--dc-blue);color:#fff;font-weight:600;
}
.dc-btn:disabled{opacity:.5;cursor:not-allowed}
.dc-btn-ghost{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);color:#fff}
.dc-btn-plain{background:var(--dc-card);color:var(--dc-text);border:1px solid var(--dc-line);font-weight:500}
.dc-btn-refresh{
  background:#ffffff;color:var(--dc-blue-deep);border:1px solid #ffffff;font-weight:700;
  box-shadow:0 2px 10px rgba(9,30,66,.22);
}
.dc-btn-refresh:disabled{background:rgba(255,255,255,.55);color:var(--dc-blue-deep)}
.dc-result{
  display:flex;gap:10px;align-items:flex-start;border-radius:10px;padding:11px 14px;
  margin:0 0 14px;font-size:13px;line-height:1.65;border:1px solid transparent;
}
.dc-result-info{background:#e8f0fe;border-color:#c3d7fb;color:#1b4fd8}
body[data-ds-dark-theme] .dc-result-info{background:#132444;border-color:#26456f;color:#9dc0ff}
.dc-progress{
  background:var(--dc-card);border:1px solid var(--dc-line);border-radius:12px;
  padding:14px 16px;margin:0 0 14px;box-shadow:0 2px 12px rgba(47,111,237,.10);
}
.dc-progress-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.dc-progress-title{font-size:13px;font-weight:700;color:var(--dc-text);display:flex;align-items:center;gap:8px}
.dc-progress-pct{font-size:18px;font-weight:800;color:var(--dc-blue);font-variant-numeric:tabular-nums}
.dc-progress-track{
  height:10px;border-radius:999px;background:var(--dc-soft);overflow:hidden;position:relative;
}
.dc-progress-fill{
  height:100%;border-radius:999px;transition:width .35s ease;
  background:linear-gradient(90deg,var(--dc-blue) 0%,var(--dc-blue-deep) 100%);
  background-size:200% 100%;animation:dc-flow 1.6s linear infinite;
}
@keyframes dc-flow{0%{background-position:0 0}100%{background-position:200% 0}}
.dc-progress-foot{
  display:flex;justify-content:space-between;gap:10px;margin-top:8px;
  font-size:11.5px;color:var(--dc-sub);
}
.dc-spin{display:inline-block;animation:dc-rot .9s linear infinite}
@keyframes dc-rot{to{transform:rotate(360deg)}}
.dc-result-ok{background:#e7f7ec;border-color:#b7e4c4;color:#166534}
.dc-result-warn{background:#fff5e6;border-color:#f6d8a8;color:#92400e}
.dc-result-err{background:#fdeaea;border-color:#f5c2c2;color:#9b1c1c}
body[data-ds-dark-theme] .dc-result-ok{background:#122c1c;border-color:#22583a;color:#86efac}
body[data-ds-dark-theme] .dc-result-warn{background:#33260f;border-color:#6b4b12;color:#fcd34d}
body[data-ds-dark-theme] .dc-result-err{background:#331515;border-color:#6b2020;color:#fca5a5}
.dc-result b{font-weight:700}
.dc-result-list{margin:6px 0 0;padding-left:18px}
.dc-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.dc-chip{
  border:1px solid var(--dc-line);background:var(--dc-card);color:var(--dc-sub);
  border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;
}
.dc-chip.on{background:var(--dc-soft);border-color:var(--dc-blue);color:var(--dc-blue);font-weight:600}
.dc-dot{width:7px;height:7px;border-radius:50%}
.dc-section{font-size:13px;font-weight:700;color:var(--dc-text);margin:18px 0 10px;display:flex;align-items:center;gap:8px}
.dc-section .dc-count{font-weight:500;color:var(--dc-sub);font-size:12px}
.dc-card{
  background:var(--dc-card);border:1px solid var(--dc-line);border-radius:12px;
  padding:12px 14px;margin-bottom:8px;display:grid;
  grid-template-columns:auto auto 1fr auto;gap:12px;align-items:start;
}
.dc-card.picked{border-color:var(--dc-blue);box-shadow:0 0 0 2px var(--dc-soft)}
.dc-cb{width:16px;height:16px;margin-top:2px;cursor:pointer;accent-color:var(--dc-blue)}
.dc-badge{font-size:11px;padding:3px 8px;border-radius:6px;white-space:nowrap;font-weight:600}
.dc-main{min-width:0}
.dc-name{font-size:13.5px;font-weight:600;color:var(--dc-text);margin-bottom:3px}
.dc-meta{font-size:11.5px;color:var(--dc-sub);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.dc-path{font-family:Consolas,Menlo,monospace;font-size:11px;color:var(--dc-sub);word-break:break-all;margin-top:4px}
.dc-note{font-size:11.5px;color:var(--dc-sub);margin-top:5px;line-height:1.6}
.dc-note b{color:var(--dc-text);font-weight:600}
.dc-size{font-size:14px;font-weight:700;color:var(--dc-text);font-variant-numeric:tabular-nums;white-space:nowrap}
.dc-more{border:none;background:none;color:var(--dc-blue);font-size:11.5px;cursor:pointer;padding:0;margin-top:4px}
.dc-keep{background:var(--dc-card);border:1px solid var(--dc-line);border-radius:12px;padding:14px}
.dc-keep-row{padding:10px 0;border-bottom:1px dashed var(--dc-line)}
.dc-keep-row:last-child{border-bottom:none}
.dc-bar{
  position:sticky;bottom:0;margin-top:16px;padding:12px 20px;
  background:var(--dc-card);border-top:1px solid var(--dc-line);
  display:flex;align-items:center;gap:10px;box-shadow:0 -6px 18px rgba(15,23,42,.06);
}
.dc-bar .sp{flex:1}
.dc-hint{font-size:12px;color:var(--dc-sub)}
.dc-banner{background:var(--dc-soft);border:1px solid var(--dc-line);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--dc-sub);margin-bottom:12px;line-height:1.7}
.dc-empty{padding:40px;text-align:center;color:var(--dc-sub);font-size:13px}
`

    function fmt(bytes) {
      const b = Number(bytes) || 0
      if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2) + ' GB'
      if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1) + ' MB'
      if (b >= 1024) return Math.round(b / 1024) + ' KB'
      return b + ' B'
    }

    function catOf(key) {
      return CATS.find((c) => c.key === key) || CATS[0]
    }

    function DiskIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', 'aria-hidden': true },
        h('rect', { x: 2.5, y: 4.5, width: 19, height: 15, rx: 3, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('circle', { cx: 12, cy: 12, r: 3.6, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('circle', { cx: 18, cy: 8, r: 1.1, fill: 'currentColor' }),
      )
    }

    function Ring({ ratio }) {
      const R = 46
      const circ = 2 * Math.PI * R
      const used = Math.max(0, Math.min(1, ratio))
      const col = used < 0.7 ? '#7ee787' : used < 0.85 ? '#ffd166' : '#ff8a80'
      return h(
        'svg',
        { viewBox: '0 0 120 120', width: 122, height: 122, 'aria-hidden': true },
        h('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: 'rgba(255,255,255,.28)', strokeWidth: 9 }),
        h('circle', {
          cx: 60, cy: 60, r: R, fill: 'none', stroke: col, strokeWidth: 9, strokeLinecap: 'round',
          strokeDasharray: circ, strokeDashoffset: circ * (1 - used), transform: 'rotate(-90 60 60)',
        }),
        h('text', { x: 60, y: 57, textAnchor: 'middle', fontSize: 23, fontWeight: 700, fill: '#fff' }, Math.round(used * 100) + '%'),
        h('text', { x: 60, y: 76, textAnchor: 'middle', fontSize: 11, fill: 'rgba(255,255,255,.85)' }, '已使用'),
      )
    }

    function Card({ item, picked, onToggle }) {
      const [open, setOpen] = useState(false)
      const cat = catOf(item.category)
      return h(
        'div',
        { className: 'dc-card' + (picked ? ' picked' : '') },
        h('input', { className: 'dc-cb', type: 'checkbox', checked: picked, onChange: () => onToggle(item.id) }),
        h('span', { className: 'dc-badge', style: { background: cat.color + '1f', color: cat.color } }, cat.label),
        h(
          'div',
          { className: 'dc-main' },
          h('div', { className: 'dc-name' }, item.name),
          h(
            'div',
            { className: 'dc-meta' },
            h('span', {}, item.admin ? '需要管理员权限' : '可直接删除'),
            open ? h('span', { className: 'dc-path' }, item.target) : null,
          ),
          open
            ? h(
                'div',
                {},
                h('div', { className: 'dc-note' }, h('b', {}, '这是什么：'), item.detail),
                h('div', { className: 'dc-note' }, h('b', {}, '删了会怎样：'), item.impact),
              )
            : null,
          h('button', { className: 'dc-more', type: 'button', onClick: () => setOpen(!open) }, open ? '收起详情' : '这是什么？'),
        ),
        h('div', { className: 'dc-size' }, fmt(item.size)),
      )
    }

    function Panel() {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      const [busy, setBusy] = useState(false)
      const [picked, setPicked] = useState({})
      const [gone, setGone] = useState({}) // 已删除的 id，永久移出列表
      const [result, setResult] = useState(null)
      const [refreshing, setRefreshing] = useState(false)
      const [scan, setScan] = useState(null)
      const [now, setNow] = useState(0)
      const scanStart = useRef(0)
      const [cat, setCat] = useState('all')
      const timer = useRef(null)

      const load = useCallback(async (force) => {
        setErr(null)
        try {
          const res = await fetch(BASE + '/report' + (force ? '?force=1' : ''), { cache: 'no-store' })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          const d = await res.json()
          setData(d)
          if (d.stale) {
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => load(false), 3000)
          }
        } catch (e) {
          setErr(String((e && e.message) || e))
        }
      }, [])

      // 带进度的重新扫描：先 start，再每 500ms 轮询进度
      const runScan = useCallback(async () => {
        if (refreshing) return
        setRefreshing(true)
        setResult(null)
        scanStart.current = Date.now()
        setNow(Date.now())
        setScan({ percent: 0, done: 0, total: 1, current: '准备中…', elapsedMs: 0 })
        try {
          const startRes = await fetch(BASE + '/scan', { cache: 'no-store' })
          if (!startRes.ok) throw new Error('HTTP ' + startRes.status)
          const started = await startRes.json()
          const id = started.id
          let misses = 0
          for (;;) {
            await new Promise((r) => setTimeout(r, 500))
            let p
            try {
              const pr = await fetch(BASE + '/progress?id=' + encodeURIComponent(id), { cache: 'no-store' })
              if (!pr.ok) throw new Error('HTTP ' + pr.status)
              p = await pr.json()
              misses = 0
            } catch (pe) {
              // 偶发网络抖动不算失败，连续 6 次才放弃
              misses += 1
              if (misses >= 6) throw new Error('进度查询连续失败：' + String((pe && pe.message) || pe))
              continue
            }
            setScan({
              percent: p.percent || 0,
              done: p.done || 0,
              total: p.total || 1,
              current: p.current || '',
              elapsedMs: p.elapsedMs || 0,
            })
            if (p.finished) {
              if (p.error) throw new Error(p.error)
              if (p.report) {
                setData(p.report)
                setResult({
                  kind: 'ok',
                  title: '扫描完成',
                  lines: [
                    '共发现 ' + p.report.items.length + ' 项可清理，合计 ' + fmt(p.report.freeable),
                    '扫描耗时 ' + (Math.round((p.report.scanMs || 0) / 100) / 10) + ' 秒',
                  ],
                })
              }
              break
            }
          }
        } catch (e) {
          // 关键：不再把整页切成错误页；扫描结果已写进缓存，直接降级拉一次快照
          const msg = String((e && e.message) || e)
          try {
            const res = await fetch(BASE + '/report', { cache: 'no-store' })
            if (res.ok) {
              setData(await res.json())
              setResult({ kind: 'warn', title: '进度查询失败，已改为直接读取结果', lines: [msg] })
            } else {
              setResult({ kind: 'err', title: '扫描失败', lines: [msg] })
            }
          } catch {
            setResult({ kind: 'err', title: '扫描失败', lines: [msg] })
          }
        } finally {
          setRefreshing(false)
          setScan(null)
        }
      }, [refreshing])

      useEffect(() => {
        load(false)
        return () => {
          if (timer.current) clearTimeout(timer.current)
        }
      }, [load])

      // 扫描期间每 100ms 刷新一次本地计时，让进度条连续走动
      const scanningNow = !!scan
      useEffect(() => {
        if (!scanningNow) return
        const t = setInterval(() => setNow(Date.now()), 100)
        return () => clearInterval(t)
      }, [scanningNow])

      const allItems = (data && data.items) || []
      const items = allItems.filter((it) => !gone[it.id])
      const shown = cat === 'all' ? items : items.filter((it) => it.category === cat)
      const pickedIds = Object.keys(picked).filter((k) => picked[k] && !gone[k])
      const pickedSize = allItems
        .filter((it) => picked[it.id] && !gone[it.id])
        .reduce((n, it) => n + it.size, 0)
      const counts = useMemo(() => {
        const m = {}
        for (const it of items) m[it.category] = (m[it.category] || 0) + 1
        return m
      }, [items])

      const toggle = (id) => {
        if (gone[id]) return
        setPicked((p) => ({ ...p, [id]: !p[id] }))
      }

      const clean = async () => {
        if (!pickedIds.length || busy) return
        setBusy(true)
        setResult({
          kind: 'info',
          title: '正在清理 ' + pickedIds.length + ' 项（' + fmt(pickedSize) + '）…',
          lines: ['请勿关闭页面'],
        })
        try {
          const url = BASE + '/clean?ids=' + pickedIds.map(encodeURIComponent).join(',')
          const res = await fetch(url, { cache: 'no-store' })
          let out = {}
          try {
            out = await res.json()
          } catch {}
          if (!res.ok) throw new Error(out.error || 'HTTP ' + res.status)

          const doneIds = (out.done || []).map((d) => d.id)
          const freedBytes = out.freed || 0

          // 1) 删成功的立刻从列表移除，不能再选
          const nextGone = { ...gone }
          doneIds.forEach((id) => (nextGone[id] = true))
          setGone(nextGone)
          setPicked((p) => {
            const n = { ...p }
            pickedIds.forEach((id) => delete n[id])
            return n
          })

          // 2) 用返回的容量立即更新顶部，不再等 10 秒重扫
          setData((d) =>
            d ? { ...d, c: out.c || d.c, freeable: Math.max(0, (d.freeable || 0) - freedBytes) } : d,
          )

          // 3) 顶部提示
          const failed = out.failed || []
          if (!doneIds.length) {
            setResult({
              kind: 'err',
              title: '一项都没删掉',
              lines: failed.map((f) => f.name + '：' + f.reason),
            })
          } else if (failed.length) {
            setResult({
              kind: 'warn',
              title: '已删除 ' + doneIds.length + ' 项，释放 ' + fmt(freedBytes),
              lines: failed.map((f) => f.name + '：' + f.reason),
            })
          } else {
            setResult({
              kind: 'ok',
              title: '已删除 ' + doneIds.length + ' 项，释放 ' + fmt(freedBytes),
              lines: [],
            })
          }

          // 4) 后台静默刷新清单（不阻塞界面）
          setTimeout(() => load(false), 1500)
        } catch (e) {
          setResult({ kind: 'err', title: '清理失败', lines: [String((e && e.message) || e)] })
        } finally {
          setBusy(false)
        }
      }

      if (err) {
        return h(
          'div',
          { className: 'dc-root' },
          h('style', {}, CSS),
          h('div', { className: 'dc-scroll' },
            h('div', { className: 'dc-empty' },
              h('div', { style: { fontWeight: 600, marginBottom: 8, color: 'var(--dc-text)' } }, '暂时读不到报告'),
              h('div', {}, '原因：' + err),
              h('div', { style: { marginTop: 14 } },
                h('button', { className: 'dc-btn', type: 'button', onClick: () => load(true) }, '重试')),
            ),
          ),
        )
      }

      if (!data) {
        return h('div', { className: 'dc-root' },
          h('style', {}, CSS),
          h('div', { className: 'dc-empty' }, '正在扫描 C 盘…首次约十秒，之后走缓存秒开'))
      }

      const usedRatio = data.c.total ? data.c.used / data.c.total : 0
      const resultCls = result ? 'dc-result dc-result-' + result.kind : ''

      // 服务端进度会因大目录统计而跳跃，用本地计时把进度条补成连续前进
      const localElapsed = scan && scanStart.current ? now - scanStart.current : 0
      const estPct = Math.min(96, Math.round((localElapsed / 12000) * 100))
      const shownPct = scan ? Math.min(99, Math.max(scan.percent || 0, estPct)) : 0

      return h(
        'div',
        { className: 'dc-root' },
        h('style', {}, CSS),
        h(
          'div',
          { className: 'dc-hero' },
          h(
            'div',
            { className: 'dc-hero-top' },
            h(DiskIcon),
            h('div', {},
              h('div', { className: 'dc-hero-title' }, 'C 盘体检报告'),
              h('div', { className: 'dc-hero-sub' },
                '扫描于 ' + new Date(data.at).toLocaleString('zh-CN') + (data.cached ? '　·　缓存' : '　·　实时扫描')),
            ),
            h('div', { style: { flex: 1 } }),
            h('button', {
              className: 'dc-btn dc-btn-refresh', type: 'button',
              disabled: busy || refreshing,
              onClick: runScan,
              title: '重新扫描 C 盘（约 10 秒，会显示进度）',
            }, refreshing
              ? [h('span', { key: 'i', className: 'dc-spin' }, '⟳'), ' 扫描中…']
              : [h('span', { key: 'i' }, '⟳'), ' 重新扫描']),
          ),
          h(
            'div',
            { className: 'dc-hero-body' },
            h(Ring, { ratio: usedRatio }),
            h(
              'div',
              { className: 'dc-metrics' },
              h('div', { className: 'dc-metric' },
                h('div', { className: 'dc-metric-k' }, 'C 盘可用'),
                h('div', { className: 'dc-metric-v' }, fmt(data.c.free))),
              h('div', { className: 'dc-metric' },
                h('div', { className: 'dc-metric-k' }, '总容量'),
                h('div', { className: 'dc-metric-v' }, fmt(data.c.total))),
              h('div', { className: 'dc-metric' },
                h('div', { className: 'dc-metric-k' }, '本次可清理'),
                h('div', { className: 'dc-metric-v' }, fmt(data.freeable))),
              h('div', { className: 'dc-metric' },
                h('div', { className: 'dc-metric-k' }, '其中需提权'),
                h('div', { className: 'dc-metric-v' }, fmt(data.adminSize))),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dc-scroll' },

          // 扫描进度条
          scan
            ? h(
                'div',
                { className: 'dc-progress' },
                h(
                  'div',
                  { className: 'dc-progress-head' },
                  h('div', { className: 'dc-progress-title' },
                    h('span', { className: 'dc-spin' }, '⟳'), '正在扫描 C 盘'),
                  h('div', { className: 'dc-progress-pct' }, shownPct + '%'),
                ),
                h('div', { className: 'dc-progress-track' },
                  h('div', {
                    className: 'dc-progress-fill',
                    style: { width: Math.max(3, shownPct) + '%' },
                  }),
                ),
                h(
                  'div',
                  { className: 'dc-progress-foot' },
                  h('span', {},
                    '正在统计：' + (scan.current || '…') +
                    '　(' + Math.min((scan.done || 0) + 1, scan.total || 1) + '/' + (scan.total || 1) + ')'),
                  h('span', {}, '已用 ' + (Math.round(localElapsed / 100) / 10) + ' 秒'),
                ),
              )
            : null,

          // 清理结果放在最上面，一定会看到
          result
            ? h(
                'div',
                { className: resultCls },
                h('div', {},
                  h('div', {}, h('b', {}, result.title)),
                  result.lines && result.lines.length
                    ? h('ul', { className: 'dc-result-list' }, result.lines.map((l, i) => h('li', { key: i }, l)))
                    : null,
                  result.kind !== 'ok'
                    ? h('div', { style: { marginTop: 4, opacity: 0.85 } },
                        '「需要管理员权限」的项目请关闭对应程序后重试，或用管理员身份运行 DSH。')
                    : null,
                ),
              )
            : null,

          h('div', { className: 'dc-banner' },
            '找到 ' + items.length + ' 项可清理内容，共 ' + fmt(data.freeable) +
            '；另有 ' + (data.keep || []).length + ' 类系统文件不能删（见页面底部）。' +
            '距上次重启 ' + Math.floor(data.uptimeDays) + ' 天。'),

          h('div', { className: 'dc-chips' },
            CATS.map((c) =>
              h('button', {
                key: c.key,
                type: 'button',
                className: 'dc-chip' + (cat === c.key ? ' on' : ''),
                onClick: () => setCat(c.key),
              },
                h('span', { className: 'dc-dot', style: { background: c.color } }),
                c.label + (c.key === 'all' ? ' ' + items.length : counts[c.key] ? ' ' + counts[c.key] : ''),
              ),
            ),
          ),

          h('div', { className: 'dc-section' },
            '可清理内容', h('span', { className: 'dc-count' }, '（点击「这是什么？」看具体说明）')),

          shown.length
            ? shown.map((it) => h(Card, { key: it.id, item: it, picked: !!picked[it.id], onToggle: toggle }))
            : h('div', { className: 'dc-empty' }, '这个分类下已经没有可清理项了'),

          h('div', { className: 'dc-section' }, '不能删除的系统文件', h('span', { className: 'dc-count' }, '（只做说明，不可勾选）')),
          h('div', { className: 'dc-keep' },
            (data.keep || []).map((k) =>
              h('div', { className: 'dc-keep-row', key: k.name },
                h('div', { style: { display: 'flex', gap: 10, alignItems: 'baseline' } },
                  h('div', { className: 'dc-name', style: { flex: 1 } }, k.name),
                  h('div', { className: 'dc-size' }, k.sizeKnown ? fmt(k.size) : '未统计'),
                ),
                h('div', { className: 'dc-note' }, h('b', {}, '为什么不能删：'), k.why),
                h('div', { className: 'dc-note' }, h('b', {}, '正确做法：'), k.how),
              ),
            ),
          ),
        ),

        h(
          'div',
          { className: 'dc-bar' },
          h('button', {
            className: 'dc-btn dc-btn-plain', type: 'button',
            onClick: () => {
              const add = {}
              shown.forEach((it) => (add[it.id] = true))
              setPicked((p) => ({ ...p, ...add }))
            },
          }, '全选本页'),
          h('button', {
            className: 'dc-btn dc-btn-plain', type: 'button', onClick: () => setPicked({}),
          }, '清空选择'),
          h('div', { className: 'sp' }),
          h('div', { className: 'dc-hint' },
            pickedIds.length ? '已选 ' + pickedIds.length + ' 项 · ' + fmt(pickedSize) : '还没选择'),
          h('button', {
            className: 'dc-btn', type: 'button',
            disabled: busy || !pickedIds.length,
            onClick: clean,
          }, busy ? '清理中…' : '一键清理所选'),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 12, label: '磁盘体检' },
            DiskIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, order: 12 }, Panel),
        )
      },
    }
  },
})
