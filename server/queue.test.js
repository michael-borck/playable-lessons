import { describe, it, expect } from 'vitest'
import { createGenerationQueue } from './queue.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('generation queue', () => {
  it('runs a submitted job and exposes its result and log', async () => {
    const q = createGenerationQueue()
    const job = q.submit(async (log) => {
      log('step one')
      log('step two')
      return { ok: true }
    })
    await flush(); await flush()
    const view = q.get(job.id)
    expect(view.status).toBe('complete')
    expect(view.result).toEqual({ ok: true })
  })

  it('assigns unguessable (UUID) job ids', () => {
    const q = createGenerationQueue()
    const job = q.submit(async () => 1)
    expect(job.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('serializes with concurrency 1 and reports queue positions', async () => {
    const q = createGenerationQueue({ concurrency: 1 })
    const d1 = deferred()
    let secondRan = false
    const first = q.submit(() => d1.promise)
    const second = q.submit(async () => { secondRan = true; return 2 })

    expect(q.get(first.id).status).toBe('processing')
    expect(q.get(second.id)).toMatchObject({ status: 'queued', position: 1 })
    expect(secondRan).toBe(false)

    d1.resolve(1)
    await flush(); await flush()
    expect(q.get(first.id).status).toBe('complete')
    await flush(); await flush()
    expect(secondRan).toBe(true)
    expect(q.get(second.id).status).toBe('complete')
  })

  it('cancels a waiting job so it never runs; refuses to interrupt a running one', async () => {
    const q = createGenerationQueue({ concurrency: 1 })
    const d1 = deferred()
    const first = q.submit(() => d1.promise)
    let ran = false
    const second = q.submit(async () => { ran = true })

    expect(q.cancel(second.id)).toBe('cancelled')
    expect(q.get(second.id)).toBeNull()
    expect(q.cancel(first.id)).toBe('running')

    d1.resolve('done')
    await flush(); await flush(); await flush()
    expect(ran).toBe(false)
    expect(q.cancel(first.id)).toBe('finished')
    expect(q.cancel('no-such-id')).toBe('not_found')
  })

  it('marks a throwing job as failed with the error message', async () => {
    const q = createGenerationQueue()
    const job = q.submit(async () => { throw new Error('boom') })
    await flush(); await flush()
    expect(q.get(job.id)).toMatchObject({ status: 'failed', error: 'boom' })
  })

  it('sweeps finished jobs after the retention window', async () => {
    const q = createGenerationQueue({ retentionMs: 30, sweepMs: 10 })
    const job = q.submit(async () => 'x')
    await flush(); await flush()
    expect(q.get(job.id).status).toBe('complete')
    await sleep(80)
    expect(q.get(job.id)).toBeNull()
  })

  it('exposes queue stats for the health endpoint', async () => {
    const q = createGenerationQueue({ concurrency: 1 })
    const d1 = deferred()
    q.submit(() => d1.promise)
    q.submit(async () => 2)
    expect(q.stats()).toEqual({ queued: 1, active: 1 })
    d1.resolve(1)
    await flush(); await flush(); await flush(); await flush()
    expect(q.stats()).toEqual({ queued: 0, active: 0 })
  })
})
