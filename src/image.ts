// See: https://regex101.com/r/cY9KFm/1
const re = /^(?:([a-z0-9_.-]+)\/)?([a-z0-9_./-]+)(?::([a-z0-9_.-]+))?(?:@sha256:([a-f0-9]+))?$/

export const WASM_MEDIA_TYPE = 'application/vnd.wasm.content.layer.v1+wasm'
const WASM_MEDIA_TYPE_LEGACY = 'application/vnd.module.wasm.content.layer.v1+wasm'

export class WasmImage {
  image: Image
  file: string

  constructor(image: Image, file: string) {
    this.image = image
    this.file = file
  }
}

export class InvalidImageSpec extends Error {
  spec: string
  constructor(spec: string) {
    super(`Invalid image spec: "${spec}"`)
    this.spec = spec
  }
}

export class Image {
  registry: string
  name: string
  tag: string
  hash?: string

  constructor(name: string, registry?: string, tag?: string, hash?: string) {
    if (!registry) {
      registry = 'docker.io'
    }
    if (registry === 'docker.io' && name.indexOf('/') === -1) {
      name = `library/${name}`
    }
    if (!tag && !hash) {
      tag = 'latest'
    }
    this.registry = registry
    this.name = name
    this.tag = tag
    this.hash = hash
  }

  static parse(image: string): Image {
    const res = re.exec(image)
    if (!res) {
      throw new InvalidImageSpec(image)
    }
    const [, registry, name, tag, hash] = res
    
    return new Image(name, registry, tag, hash)
  }

  reference(): string {
    if (this.hash) {
      return `sha256:${this.hash}`
    }
    return this.tag
  }

  toString(): string {
    let n = `${this.registry}/${this.name}:${this.tag}`
    if (this.hash) {
      n += `@sha256:${this.hash}`
    }
    return n
  }
}

export function isValidWasmType(type: string): boolean {
  return type === WASM_MEDIA_TYPE || type === WASM_MEDIA_TYPE_LEGACY
}
