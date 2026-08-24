/**
 * In-process generation job queue for the public teaser.
 *
 * cite-sight's semantics (job ids, positions, cancel-while-waiting) without
 * its infrastructure: no Redis, one process, jobs kept in memory. Trade-off is
 * deliberate — a server restart loses queued/running jobs, and clients are
 * told so ("that job is gone — generate again"). Right-sized for a
 * single-container demo; results are kept for an hour so a visitor can leave
 * and come back.
 *
 * The job id is a random UUID: it's the only thing guarding the status and
 * cancel endpoints, so a sequential id would let anybody read — or cancel — a
 * stranger's job by counting upwards.
 */
const { randomUUID } = require('crypto')

const MAX_LOG_LINES = 100 // per job; the GUI tail only shows the last few

/**
 * @param {object} opts
 * @param {number} [opts.concurrency] Jobs running at once (default 1 — image
 *   backends and API rate limits prefer serial).
 * @param {number} [opts.retentionMs] How long finished jobs stay fetchable.
 * @param {number} [opts.sweepMs] How often finished jobs are reaped.
 */
function createGenerationQueue({ concurrency = 1, retentionMs = 60 * 60 * 1000, sweepMs = 10 * 60 * 1000 } = {}) {
  /** @type {Map<string, object>} */
  const jobs = new Map()
  /** @type {string[]} FIFO of waiting job ids */
  const waiting = []
  let activeCount = 0

  const sweeper = setInterval(() => {
    const cutoff = Date.now() - retentionMs
    for (const [id, job] of jobs) {
      if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id)
    }
  }, sweepMs)
  sweeper.unref?.() // never keep a process alive just to reap

  /**
   * Enqueue a job. `run` receives a log function and resolves to the result
   * payload (or throws). Returns the job.
   */
  function submit(run) {
    const job = {
      id: randomUUID(),
      status: 'queued', // queued | processing | complete | failed
      log: [],
      result: undefined,
      error: undefined,
      createdAt: Date.now(),
      finishedAt: 0,
      run
    }
    jobs.set(job.id, job)
    waiting.push(job.id)
    pump()
    return job
  }

  /** 1-based position in the waiting list; null when not waiting. */
  function position(id) {
    const i = waiting.indexOf(id)
    return i === -1 ? null : i + 1
  }

  function pump() {
    while (activeCount < concurrency && waiting.length > 0) {
      const id = waiting.shift()
      const job = jobs.get(id)
      if (!job || job.status !== 'queued') continue // cancelled while waiting
      activeCount++
      job.status = 'processing'
      const log = (m) => {
        job.log.push(String(m))
        if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES)
      }
      Promise.resolve()
        .then(() => job.run(log))
        .then((result) => {
          job.result = result
          job.status = 'complete'
        })
        .catch((err) => {
          job.error = err instanceof Error ? err.message : String(err)
          job.status = 'failed'
        })
        .finally(() => {
          job.finishedAt = Date.now()
          activeCount--
          pump()
        })
    }
  }

  /** Status view for GET /api/job/:id. Null when the id is unknown/gone. */
  function get(id) {
    const job = jobs.get(id)
    if (!job) return null
    switch (job.status) {
      case 'queued':
        return { status: 'queued', position: position(id) }
      case 'processing':
        return { status: 'processing', log: job.log.slice(-20) }
      case 'complete':
        return { status: 'complete', result: job.result }
      default:
        return { status: 'failed', error: job.error || 'Unknown error' }
    }
  }

  /**
   * Cancel a job that hasn't started. Honest answers, mirroring cite-sight:
   * the pipeline has no abort signal, so a running job plays out to the end.
   *   'cancelled' — pulled from the waiting list, will never run
   *   'running'   — already in progress; nothing changed
   *   'finished'  — already complete/failed
   *   'not_found' — no such job (or it aged out)
   */
  function cancel(id) {
    const job = jobs.get(id)
    if (!job) return 'not_found'
    if (job.status === 'processing') return 'running'
    if (job.status !== 'queued') return 'finished'
    jobs.delete(id)
    const i = waiting.indexOf(id)
    if (i !== -1) waiting.splice(i, 1)
    return 'cancelled'
  }

  return {
    submit,
    get,
    cancel,
    position,
    stats: () => ({ queued: waiting.length, active: activeCount })
  }
}

module.exports = { createGenerationQueue }
