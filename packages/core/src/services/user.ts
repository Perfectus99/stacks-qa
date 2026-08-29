import type { ApiClient } from '../client.js'

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

  register(input: RegisterInput): Promise<RegisteredUser> {
    return this.api.post<RegisteredUser>('/user/auth/register', { body: { ...input } })
  }

  /** Register without throwing on conflict — for collision-handling tests. */
  registerStatus(input: RegisterInput): Promise<number> {
    return this.api.status('POST', '/user/auth/register', { body: { ...input } })
  }

  login(input: { username: string; password: string }): Promise<Session> {
    return this.api.post<Session>('/user/auth/login', { body: { ...input } })
  }

  profile(): Promise<Profile> {
    return this.api.get<Profile>('/user/profile')
  }
}
