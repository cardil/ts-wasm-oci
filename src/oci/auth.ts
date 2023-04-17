export interface AuthState {
  loggedIn: boolean
  auth: WwwAuthenticate
}

export enum AuthType {
  Oauth2,
  Docker
}

export interface Oauth2Authorization {
  access_token: string
}

export interface Authorization {
  token: string
}

export function asString(auth: Authorization): string {
  return `Bearer ${auth.token}`
}

export class WwwAuthenticate {
  type: AuthType
  options: Map<string, string>
  constructor(type: AuthType, options: Map<string, string>) {
    this.type = type
    this.options = options
  }

  static parse(auth: string): WwwAuthenticate | undefined {
    if (!auth) {
      return undefined
    }
    const [type, options] = auth.split(' ')
    const res = new Map<string, string>()
    if (options) {
      const parts = options.split(',')
      for (const part of parts) {
        const [key, value] = part.split('=')
        res.set(key.trim(), value.trim().slice(1, -1))
      }
    }
    switch (type) {
      case 'Bearer':
        if (res.get('realm').endsWith('/oauth2/token')) {
          return new WwwAuthenticate(AuthType.Oauth2, res)
        }
        return new WwwAuthenticate(AuthType.Docker, res)
    }
    throw new IllegalAuth(auth)
  }
}

export class IllegalAuth extends Error {
  auth: string | AuthState
  constructor(auth: string | AuthState) {
    super(`Illegal auth: "${auth}"`)
    this.auth = auth
  }
}
