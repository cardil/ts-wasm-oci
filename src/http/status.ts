import { IRestResponse } from 'typed-rest-client'
import { IHttpClientResponse } from 'typed-rest-client/Interfaces'

type Response = IRestResponse<unknown> | IHttpClientResponse

export class StatusCode {
  static OK = new StatusCode(200, 'OK')
  static CREATED = new StatusCode(201, 'Created')
  static MULTIPLE_CHOICES = new StatusCode(300, 'Multiple Choices')
  static MOVED_PERMANENTLY = new StatusCode(301, 'Moved Permanently')
  static UNAUTHORIZED = new StatusCode(401, 'Unauthorized')
  static INTERNAL_SERVER_ERROR = new StatusCode(500, 'Internal Server Error')

  code: number
  text: string

  constructor(code: number, text?: string) {
    this.code = code
    this.text = text ?? StatusCode.fromCode(code).text
  }

  equals(other: StatusCode | unknown): boolean {
    if (!(other instanceof StatusCode)) {
      return false
    }
    return this.code === other.code
  }

  isSuccessful(): boolean {
    return this.code >= StatusCode.OK.code &&
      this.code < StatusCode.MULTIPLE_CHOICES.code
  }

  toString(): string {
    return `HTTP ${this.code} ${this.text}`
  }

  static fromCode(code: number): StatusCode {
    const known = [
      StatusCode.OK,
      StatusCode.CREATED,
      StatusCode.MULTIPLE_CHOICES,
      StatusCode.MOVED_PERMANENTLY,
      StatusCode.UNAUTHORIZED,
      StatusCode.INTERNAL_SERVER_ERROR
    ]
    for (const status of known) {
      if (status.code === code) {
        return status
      }
    }
    return new StatusCode(code, 'Unknown')
  }
}

export function statusOf(res: Response): StatusCode {
  if (isClientResponse(res)) {
    return new StatusCode(res.message.statusCode)
  } else {
    return new StatusCode(res.statusCode)
  }
}

function isClientResponse(res: Response): res is IHttpClientResponse {
  return 'message' in res
}
