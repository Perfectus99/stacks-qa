import { env } from '../env.js'

const pending = new Set<Promise<void>>()

/**
 * Run work shortly after the request that scheduled it has answered.
 *
 * Deliberately not immediate. Release progress in the systems this models is
 * recomputed by a periodic job, so a caller who reads it straight back may see
 * the figure from before their own activity. Making that true here means the
 * suite has to be written for it — and a test that assumes the figure is
 * instant fails against the demo rather than against production.
 *
 * The delay is configurable and small, not zero: a queue that runs inline in
 * CI would let the suite quietly assume immediacy and pass.
 */
export function enqueue(name: string, task: () => Promise<void>): void {
  const work = new Promise<void>((resolve) => {
    setTimeout(() => {
      task()
        .catch((error: unknown) => {
          console.error(`[jobs] ${name} failed`, error)
        })
        .finally(resolve)
    }, env.progressDelayMs)
  })

  pending.add(work)
  void work.finally(() => pending.delete(work))
}

/** Let in-flight work finish before the process goes away. */
export async function drain(): Promise<void> {
  await Promise.all([...pending])
}
