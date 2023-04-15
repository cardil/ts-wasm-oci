import { IRestResponse } from 'typed-rest-client'
import { IHttpClientResponse } from 'typed-rest-client/Interfaces'

type Response = IRestResponse<unknown> | IHttpClientResponse

function isClientResponse(res: Response): res is IHttpClientResponse {
  return 'message' in res
}

function statusOf(res: Response): number {
  if (isClientResponse(res)) {
    return res.message.statusCode
  } else {
    return res.statusCode
  }
}

export function isSuccessful(res: Response): boolean {
  const code = statusOf(res)
  return code >= 200 && code < 300
}
