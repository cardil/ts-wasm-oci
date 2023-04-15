export class Scope {
  repository: string
  action: string

  constructor(repository: string, action = 'pull') {
    this.repository = repository
    this.action = action
  }

  toString(): string {
    return `repository:${this.repository}:${this.action}`
  }
}
