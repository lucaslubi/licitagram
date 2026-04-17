import type { Processor } from 'bullmq'

export const noopProcessor: Processor<{ ping: string }, { ok: true }> = async (job) => {
  job.log(`noop received ping=${job.data.ping}`)
  return { ok: true }
}
