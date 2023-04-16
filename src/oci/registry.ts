import { IRequestOptions, RestClient } from 'typed-rest-client'
import * as pkg from '../../package.json'
import { Authorization, asString } from './authorization'
import { Scope } from './scope'
import { Manifest } from './manifest'
import { IHeaders, IHttpClientResponse } from 'typed-rest-client/Interfaces'
import { StatusCode, statusOf } from '../http/status'

const ua = `${pkg.name}/${pkg.version}`
const acceptedManifestType = 'application/vnd.oci.image.manifest.v1+json'

export class InvalidRestResponse extends Error {
  cause: StatusCode | Error
  constructor(cause: StatusCode | Error, message: string) {
    super(message + `: ${cause}`)
    this.cause = cause
  }
}

export class Registry {
  private client: RestClient
  private service: string
  private baseUrl: string

  constructor(registry: string, schema = 'https') {
    this.service = registry
    this.baseUrl = `${schema}://${registry}`
    this.client = new RestClient(ua, this.baseUrl,
      [], {
      allowRedirects: true,
      headers: {
        'Docker-Distribution-API-Version': 'registry/2.0'
      }
    })
  }

  async check(auth?: Authorization): Promise<void> {
    const opts = auth ? {
      additionalHeaders: {
        Authorization: asString(auth)
      }
    } : undefined
    const res = await this.client.client.get(`${this.baseUrl}/v2/`, opts)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, `Failed to ping registry: ${this.service}`)
    }
  }

  async authorize(scope: Scope,
    service?: string,
    auth?: Authorization,
    account?: string
  ): Promise<Authorization> {
    if (service === undefined) {
      service = this.service
    }
    const opts: IRequestOptions = {
      queryParameters: {
        params: {
          scope: scope.toString(),
          service
        }
      }
    }
    if (account) {
      opts.queryParameters.params.account = account
    }
    if (auth) {
      opts.additionalHeaders = {
        Authorization: asString(auth)
      }
    }
    const res = await this.client.get<Authorization>('/v2/auth', opts)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, 'Failed to authorize')
    }
    return res.result
  }

  async manifest(
    repository: string,
    reference: string,
    auth?: Authorization
  ): Promise<Manifest> {
    const opts: IRequestOptions = {
      acceptHeader: acceptedManifestType,
      additionalHeaders: {}
    }
    if (auth) {
      opts.additionalHeaders.Authorization = asString(auth)
    }

    const res = await this.client.get<Manifest>(`/v2/${repository}/manifests/${reference}`, opts)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, 'Failed to get manifest')
    }
    return res.result
  }

  async blob(repository: string, digest: string, auth?: Authorization): Promise<IHttpClientResponse> {
    const headers: IHeaders = {}
    if (auth) {
      headers.Authorization = asString(auth)
    }
    const http = this.client.client
    return http.get(`${this.baseUrl}/v2/${repository}/blobs/${digest}`, headers)
  }
}

