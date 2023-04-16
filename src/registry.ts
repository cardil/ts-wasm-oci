import { Image, WasmImage, WASM_MEDIA_TYPE } from './image'
import fs from 'fs/promises'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { InvalidRestResponse, Registry } from './oci/registry'
import { Scope } from './oci/scope'
import { Authorization } from './oci/authorization'
import { StatusCode, statusOf } from './http/status'
import { calcDigest } from './hash/digest'

export class WasmRegistry {
  private workdir: string

  constructor(workdir: string) {
    this.workdir = workdir
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  push(wasm: WasmImage): Promise<void> {
    return Promise.reject(new NotImplemented())
  }

  pull(image: string): Promise<WasmImage> {
    const im = Image.parse(image)

    return this.fetchImage(im)
  }

  private async verifyWorkdir(): Promise<void> {
    try {
      await fs.stat(this.workdir)
    } catch (e) {
      // directory does not exist, should be ok to create it
      return
    }
    try {
      await fs.access(this.workdir, fs.constants.W_OK)
    } catch (e) {

      throw new InvalidWorkdir(this.workdir, e)
    }
  }

  private async fetchImage(im: Image): Promise<WasmImage> {
    await this.verifyWorkdir()

    const reg = new Registry(im.registry)

    const auth = await this.authorize(im, reg)

    const manifest = await reg.manifest(im.name, im.reference(), auth)

    if (manifest.layers.length != 1) {
      throw new InvalidImage(im, `Want one layer, got: ${manifest.layers.length}`)
    }
    const layer = manifest.layers[0]
    if (layer.mediaType !== WASM_MEDIA_TYPE) {
      throw new InvalidImage(im, `Want media type "${WASM_MEDIA_TYPE}", got: "${layer.mediaType}"`)
    }

    const file = `${this.workdir}/${slug(im.name)}-${slug(im.reference())}.wasm`
    await fs.mkdir(this.workdir, { recursive: true })

    const res = await reg.blob(im.name, layer.digest, auth)
    const status = statusOf(res)
    if (!status.isSuccessful()) {
      throw new InvalidRestResponse(status, 'Failed to fetch blob')
    }

    const writer = createWriteStream(file)
    try {
      await pipeline(res.message, writer)
    } catch (e) {
      throw new InvalidRestResponse(e, 'Failed to fetch blob')
    }

    const st = await fs.stat(file)
    if (st.size != layer.size) {
      await fs.rm(file)
      throw new InvalidImage(im, `Want size ${layer.size}, got: ${st.size}`)
    }

    const [algorithm, wantDigest] = layer.digest.split(':')
    const gotDigest = await calcDigest(algorithm, file)
    if (gotDigest != wantDigest) {
      await fs.rm(file)
      throw new InvalidImage(im, `Want digest ${layer.digest}, got: ${algorithm}:${gotDigest}`)
    }

    return new WasmImage(im, file)
  }

  private async authorize(im: Image, reg: Registry): Promise<Authorization> {
    let auth: Authorization
    try {
      await reg.check()
    } catch (e) {
      if (!(e instanceof InvalidRestResponse)
        || !StatusCode.UNAUTHORIZED.equals((e as InvalidRestResponse).cause)) {
        throw e
      }
      auth = await reg.authorize(new Scope(im.name, 'pull'))
    }

    return auth
  }
}

export class InvalidImage extends Error {
  image: Image
  reason: string
  constructor(image: Image, reason: string) {
    super(`Invalid image "${image}": ${reason}`)
    this.image = image
    this.reason = reason
  }
}

export class InvalidWorkdir extends Error {
  workdir: string
  cause: Error
  constructor(workdir: string, cause: Error) {
    super(`Invalid workdir: ${workdir}: ${cause.message}`)
    this.workdir = workdir
    this.cause = cause
  }
}

class NotImplemented extends Error {
  constructor() {
    super('Not implemented')
  }
}


function slug(str: string): string {
  return str.replace(/[^a-z0-9]/gi, '-')
    .replace(/-{2,}/, '-')
    .toLowerCase()
}
