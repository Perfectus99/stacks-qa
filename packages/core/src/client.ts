import { request, type APIRequestContext } from '@playwright/test'
import { env } from './env.js'
import { HttpError } from './http-error.js'
import { UserService } from './services/user.js'
import { WalletService } from './services/wallet.js'
import { PaymentService } from './services/payment.js'
import { PromotionService } from './services/promotion.js'

type Body = Record<string, unknown>

interface SendOptions {
  body?: Body
  query?: Record<string, string | number | undefined>
  /** Statuses to accept without throwing. Defaults to 2xx. */
  allow?: number[]
}

/**
 * The single definition of how this suite talks to the platform.
 *
 * Status assertion lives here rather than in the specs: a 500 from a call a
 * test only makes as setup should fail as a broken precondition, not as a
 * confusing assertion three lines later. Tests that mean to exercise an error
 * path opt in explicitly with `allow`.
 */
export class ApiClient {
  readonly user: UserService
  readonly wallet: WalletService
  readonly payment: PaymentService
  readonly promotion: PromotionService

  private constructor(
    private readonly ctx: APIRequestContext,
    private token: string | undefined,
    readonly tenantSlug: string,
  ) {
    this.user = new UserService(this)
    this.wallet = new WalletService(this)
    this.payment = new PaymentService(this)
    this.promotion = new PromotionService(this)
  }

  /**
   * An unauthenticated client — registration and login only.
   *
   * The tenant travels on every request. Registration and login need it because
   * they have no session to read it from; on authenticated calls it is ignored,
   * and sending it anyway keeps one client honest about which tenant it speaks
   * for.
   */
  static async anonymous(tenantSlug = 'demo'): Promise<ApiClient> {
    const ctx = await request.newContext({ baseURL: env.baseUrl })
    return new ApiClient(ctx, undefined, tenantSlug)
  }

  /** Log in and return a client that carries the resulting session. */
  static async asUser(
    username: string,
    password: string,
    tenantSlug = 'demo',
  ): Promise<ApiClient> {
    const client = await ApiClient.anonymous(tenantSlug)
    const session = await client.user.login({ username, password })
    return client.authenticatedAs(session.accessToken)
  }

  /** Log in as a tenant's seeded administrator. */
  static async asAdmin(tenantSlug = 'demo'): Promise<ApiClient> {
    return ApiClient.asUser(env.admin.username, env.admin.password, tenantSlug)
  }

  authenticatedAs(token: string): this {
    this.token = token
    return this
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose()
  }

  get<T>(path: string, options: SendOptions = {}): Promise<T> {
    return this.send<T>('GET', path, options)
  }

  post<T>(path: string, options: SendOptions = {}): Promise<T> {
    return this.send<T>('POST', path, options)
  }

  patch<T>(path: string, options: SendOptions = {}): Promise<T> {
    return this.send<T>('PATCH', path, options)
  }

  delete<T>(path: string, options: SendOptions = {}): Promise<T> {
    return this.send<T>('DELETE', path, options)
  }

  /** Send a request and return its status without throwing — for negative tests. */
  async status(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: SendOptions = {},
  ): Promise<number> {
    const response = await this.ctx.fetch(this.url(path, options.query), {
      method,
      headers: this.headers(),
      ...(options.body ? { data: options.body } : {}),
    })
    return response.status()
  }

  private async send<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: SendOptions,
  ): Promise<T> {
    const url = this.url(path, options.query)
    const response = await this.ctx.fetch(url, {
      method,
      headers: this.headers(),
      ...(options.body ? { data: options.body } : {}),
    })

    const payload = await this.parse(response.headers()['content-type'], response)
    const allowed = options.allow ?? []
    if (!response.ok() && !allowed.includes(response.status())) {
      throw new HttpError(response.status(), method, url, payload)
    }
    return payload as T
  }

  private async parse(contentType: string | undefined, response: { text(): Promise<string> }): Promise<unknown> {
    const text = await response.text()
    if (!text) return undefined
    if (contentType?.includes('application/json')) {
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    }
    return text
  }

  private url(path: string, query: SendOptions['query']): string {
    if (!query) return path
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value))
    }
    const qs = params.toString()
    return qs ? `${path}?${qs}` : path
  }

  private headers(): Record<string, string> {
    return {
      'x-tenant-slug': this.tenantSlug,
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    }
  }
}
