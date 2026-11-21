// Worker 线程：在独立线程里遍历磁盘，主线程保持可响应。
import { parentPort, workerData } from 'node:worker_threads'
import { catalogItems, measureOne, keepEntries } from './catalog.js'

// 只有作为 worker 运行时才干活；被普通 import 时什么都不做，避免报错
if (parentPort) {
  const full = !!(workerData && workerData.full)
  const items = catalogItems()
  const total = items.length
  const out = []

  for (let i = 0; i < total; i++) {
    const it = items[i]
    parentPort.postMessage({ type: 'progress', done: i, total, current: it.name })
    measureOne(it)
    if (it.size > 0) out.push(it)
  }

  parentPort.postMessage({ type: 'done', items: out, keep: keepEntries(full) })
}
