import { IRequestOptions, RestClient } from 'typed-rest-client'
import { BearerCredentialHandler } from 'typed-rest-client/handlers/bearertoken'
import ifm from 'typed-rest-client/Interfaces'
import * as pkg from '../../package.json'
import { AuthState, Authorization, Oauth2Authorization, WwwAuthenticate, asString } from './auth'
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
    const opts = {
      allowRedirects: true,
      headers: {
        'Docker-Distribution-API-Version': 'registry/2.0'
      },
    } as ifm.IRequestOptions
    this.client = new RestClient(ua, this.baseUrl, [], opts)
  }

  async check(auth?: Authorization): Promise<AuthState> {
    const opts = auth ? {
      additionalHeaders: {
        Authorization: asString(auth)
      }
    } : undefined
    const res = await this.client.client.get(`${this.baseUrl}/v2/`, opts)
    const status = statusOf(res)
    const authn = WwwAuthenticate.parse(res.message.headers['www-authenticate'] ?? '')
    if (status.equals(StatusCode.UNAUTHORIZED)) {
      return {
        loggedIn: false,
        auth: authn,
      }
    }
    if (status.isSuccessful()) {
      return {
        loggedIn: true,
        auth: authn,
      }
    }
    throw new InvalidRestResponse(status, `Failed to ping registry: ${this.service}`)
  }

  async oauth2Authorize(
    scope: Scope,
    service?: string,
    auth?: Authorization,
    account?: string
  ): Promise<void> {
    const opts = this.authOptions(scope, service, auth, account)
    const res = await this.client.get<Oauth2Authorization>('/oauth2/token', opts)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, 'Failed to authorize')
    }
    return this.useAuth({
      token: res.result.access_token,
    })
  }

  async dockerAuthorize(
    scope: Scope,
    service?: string,
    auth?: Authorization,
    account?: string
  ): Promise<void> {
    const opts = this.authOptions(scope, service, auth, account)
    const res = await this.client.get<Authorization>('/v2/auth', opts)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, 'Failed to authorize')
    }
    return this.useAuth(res.result)
  }

  async manifest(repository: string, reference: string): Promise<Manifest> {
    const opts: IRequestOptions = {
      acceptHeader: acceptedManifestType,
    }
    const res = await this.client.get<Manifest>(`/v2/${repository}/manifests/${reference}`, opts)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, 'Failed to get manifest')
    }
    return res.result
  }

  async blob(repository: string, digest: string): Promise<IHttpClientResponse> {
    const headers: IHeaders = {}
    const http = this.client.client
    const url = `${this.baseUrl}/v2/${repository}/blobs/${digest}`
    return http.get(url, headers)
  }

  private useAuth(auth: Authorization) {
    const handler = new BearerCredentialHandler(auth.token)
    this.client.client.handlers.push(handler)
  }

  private authOptions(
    scope: Scope,
    service?: string,
    auth?: Authorization,
    account?: string
  ): IRequestOptions {
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
    return opts
  }
}
