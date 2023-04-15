export interface Manifest {
  schemaVersion: number
  layers: Layer[]
  config: Config
}

export interface Layer {
  digest: string
  size: number
  mediaType: string
  annotations: Map<string, string>
}

export interface Config {
  digest: string
  size: number
  mediaType: string
}
