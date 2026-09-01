import type { ApiClient } from '../client.js'
import * as contracts from '../contracts.js'
import { contract } from '../contracts.js'

export interface RegisterInput {
  username: string
  password: string
  currency: string
}

export interface RegisteredUser {
  userId: string
  username: string
}

export interface Session {
  accessToken: string
  userId: string
  tenantId: string
}

export interface Profile {
  userId: string
  username: string
  currency: string
  tenantId: string
}

export class UserService {
  constructor(private readonly api: ApiClient) {}

  async register(input: RegisterInput): Promise<RegisteredUser> {
    const body = await this.api.post('/user/auth/register', { body: { ...input } })
    return contract('POST /user/auth/register', contracts.registeredUser, body)
  }

  /** Register without throwing on conflict — for collision-handling tests. */
  registerStatus(input: RegisterInput): Promise<number> {
    return this.api.status('POST', '/user/auth/register', { body: { ...input } })
  }

  async login(input: { username: string; password: string }): Promise<Session> {
    const body = await this.api.post('/user/auth/login', { body: { ...input } })
    return contract('POST /user/auth/login', contracts.session, body)
  }

  async profile(): Promise<Profile> {
    return contract('GET /user/profile', contracts.profile, await this.api.get('/user/profile'))
  }
}
