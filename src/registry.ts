import { Image, WasmImage, WASM_MEDIA_TYPE } from './image'
import fs from 'fs/promises'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { InvalidRestResponse, Registry } from './oci/registry'
import { Scope } from './oci/scope'
import { Authorization } from './oci/authorization'
import { isSuccessful } from './http/status'

export interface WasmRegistry {
  push(wasm: WasmImage): Promise<void>
  pull(image: string): Promise<WasmImage>
}

export async function createWasmRegistry(workdir: string): Promise<WasmRegistry> {
  try {
    await fs.access(workdir, fs.constants.W_OK)
  } catch (e) {
    throw new InvalidWorkdir(workdir, e)
  }
  return new WorkdirWasmRegistry(workdir)
}

class WorkdirWasmRegistry implements WasmRegistry {
  private workdir: string

  constructor(workdir: string) {
    this.workdir = workdir
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  push(_wasm: WasmImage): Promise<void> {
    return new Promise((_resolve, reject) => {
      reject(new NotImplemented())
    })
  }

  pull(image: string): Promise<WasmImage> {
    const im = Image.parse(image)

    return this.fetchImage(im)
  }

  private async fetchImage(im: Image): Promise<WasmImage> {
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
    if (!isSuccessful(res)) {
      throw new InvalidRestResponse(res.message.statusCode, 'Failed to fetch blob')
    }

    const writer = createWriteStream(file)
    await pipeline(res.message, writer)

    const st = await fs.stat(file)
    if (st.size != layer.size) {
      await fs.rm(file)
      throw new InvalidImage(im, `Want size ${layer.size}, got: ${st.size}`)
    } 

    return new WasmImage(im, file)
  }

  private async authorize(im: Image, reg: Registry): Promise<Authorization> {
    let auth : Authorization
    try {
      await reg.check()
    } catch (e) {
      if (!(e instanceof InvalidRestResponse)
        || (e as InvalidRestResponse).code !== 401) {
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
