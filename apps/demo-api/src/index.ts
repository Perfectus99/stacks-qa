import { buildApp } from './app.js'
import { env } from './env.js'
import { migrate } from './migrate.js'
import { seed } from './seed.js'

const app = buildApp()

try {
  const applied = await migrate()
  if (applied.length > 0) app.log.info({ applied }, 'migrations applied')
  await seed()

  await app.listen({ port: env.port, host: env.host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0))
  })
}
