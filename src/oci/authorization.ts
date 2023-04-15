export interface Authorization {
  token: string
}

export function asString(auth: Authorization) : string {
  return `Bearer ${auth.token}`
}
