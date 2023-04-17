import { Image, WasmImage, isValidWasmType } from './image'
import fs from 'fs/promises'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { InvalidRestResponse, Registry } from './oci/registry'
import { Scope } from './oci/scope'
import { AuthType, IllegalAuth } from './oci/auth'
import { statusOf } from './http/status'
import { calcDigest } from './hash/digest'

/**
 * WasmRegistry is a main class for interacting with wasm images. It provides
 * methods for pushing and pulling wasm images from remote registries.
 */
export class WasmRegistry {
  private workdir: string

  /**
   * Creates a new WasmRegistry instance. The workdir is used to store
   * downloaded wasm files.
   */
  constructor(workdir: string) {
    this.workdir = workdir
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async push(wasm: WasmImage): Promise<void> {
    throw new NotImplemented()
  }

  /**
   * Pulls the wasm image from the remote registry
   * 
   * @param im image to pull from remote registry
   * @returns a WasmImage with the file path to the downloaded wasm file
   */
  async pull(im: Image): Promise<WasmImage> {
    await this.verifyWorkdir()

    const reg = new Registry(im.registry)

    await this.authorize(im, reg)

    const manifest = await reg.manifest(im.name, im.reference())

    if (manifest.layers.length != 1) {
      throw new InvalidImage(im, `Want one layer, got: ${manifest.layers.length}`)
    }
    const layer = manifest.layers[0]
    if (!isValidWasmType(layer.mediaType)) {
      throw new InvalidImage(im, 
        `Want WASM media type, got: "${layer.mediaType}"`)
    }

    const file = `${this.workdir}/${slug(im.name)}-${slug(im.reference())}.wasm`
    await fs.mkdir(this.workdir, { recursive: true })

    const res = await reg.blob(im.name, layer.digest)
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

  private async authorize(im: Image, reg: Registry): Promise<void> {
    const state = await reg.check()

    if (state.loggedIn) {
      // TODO: implement login
      throw new NotImplemented()
    }

    switch (state.auth.type) {
      case AuthType.Docker:
        return await reg.dockerAuthorize(new Scope(im.name, 'pull'))
      case AuthType.Oauth2:
        return await reg.oauth2Authorize(new Scope(im.name, 'pull'))
      default:
        throw new IllegalAuth(state)
    }
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
    super(`Invalid workdir: ${workdir}: ${cause}`)
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
