import { buildApp } from './app.js'
import { env } from './env.js'

const app = buildApp()

try {
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
