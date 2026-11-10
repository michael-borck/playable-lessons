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
 * @param {number} [opts.maxJobs] Hard cap on tracked jobs (queued + running +
 *   retained). Finished jobs are evicted oldest-first to make room.
 * @param {number} [opts.maxResultBytes] Reject a result larger than this —
 *   a public teaser must not be fillable with a handful of huge payloads.
 * @param {number} [opts.maxArtifactBytes] Same idea for the internal data kept
 *   for on-demand downloads (Ink source + scene images). Defaults to
 *   maxResultBytes.
 */
function createGenerationQueue({
  concurrency = 1,
  retentionMs = 60 * 60 * 1000,
  sweepMs = 10 * 60 * 1000,
  maxJobs = 100,
  maxResultBytes = 16 * 1024 * 1024,
  maxArtifactBytes = maxResultBytes
} = {}) {
  /** @type {Map<string, object>} */
  const jobs = new Map()
  /** @type {Map<string, unknown>} Internal, never serialized with a job view. */
  const artifacts = new Map()
  /** @type {string[]} FIFO of waiting job ids */
  const waiting = []
  let activeCount = 0

  /** Remove a job and any internal artifact it kept for on-demand exports. */
  function removeJob(id) {
    jobs.delete(id)
    artifacts.delete(id)
  }

  const sweeper = setInterval(() => {
    const cutoff = Date.now() - retentionMs
    for (const [id, job] of jobs) {
      if (job.finishedAt && job.finishedAt < cutoff) removeJob(id)
    }
  }, sweepMs)
  sweeper.unref?.() // never keep a process alive just to reap

  /** Drop the oldest retained (finished) job. Returns false when none exist. */
  function evictOneFinished() {
    for (const [id, job] of jobs) {
      if (job.finishedAt) {
        removeJob(id)
        return true
      }
    }
    return false
  }

  /**
   * Enqueue a job. `run` receives a log function and the job id (so it can
   * attach an internal artifact for on-demand exports) and resolves to the
   * public result payload (or throws). Returns the job, or null when the queue
   * is full of still-running work.
   */
  function submit(run) {
    if (jobs.size >= maxJobs && !evictOneFinished()) return null
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
        .then(() => job.run(log, job.id))
        .then((result) => {
          let size = 0
          try {
            size = Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8')
          } catch {
            size = Infinity
          }
          if (size > maxResultBytes) {
            job.error = `Result too large (${Math.ceil(size / 1024 / 1024)} MB; limit ${Math.ceil(maxResultBytes / 1024 / 1024)} MB).`
            job.status = 'failed'
            artifacts.delete(job.id)
            return
          }
          job.result = result
          job.status = 'complete'
        })
        .catch((err) => {
          job.error = err instanceof Error ? err.message : String(err)
          job.status = 'failed'
          artifacts.delete(job.id)
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
    removeJob(id)
    const i = waiting.indexOf(id)
    if (i !== -1) waiting.splice(i, 1)
    return 'cancelled'
  }

  /**
   * Attach data that is needed to build downloads on demand (e.g. Ink source +
   * scene images) without inflating the job view sent to the browser. Removed
   * with the job.
   */
  function setArtifact(id, artifact) {
    if (!jobs.has(id)) return
    let size = 0
    try {
      size = Buffer.byteLength(JSON.stringify(artifact) ?? '', 'utf8')
    } catch {
      size = Infinity
    }
    if (size > maxArtifactBytes) {
      const mb = Math.ceil(size / 1024 / 1024)
      const limit = Math.ceil(maxArtifactBytes / 1024 / 1024)
      throw new Error(`Story data too large (${mb} MB; limit ${limit} MB). Reduce the scene image count.`)
    }
    artifacts.set(id, artifact)
  }

  /** Internal export data for a job, or null when unknown/expired. */
  function getArtifact(id) {
    return artifacts.get(id) ?? null
  }

  return {
    submit,
    get,
    cancel,
    position,
    setArtifact,
    getArtifact,
    stats: () => ({ queued: waiting.length, active: activeCount, tracked: jobs.size })
  }
}

module.exports = { createGenerationQueue }
