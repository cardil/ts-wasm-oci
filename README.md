# WASM-OCI

The WASM-OCI is a library that handle basic push/pull operations for WASM artifacts hosted on the OCI compatible container registry.

## Features

### Pulling WASM modules

```ts
import { WasmRegistry } from 'wasm-oci'

const registry = new WasmRegistry('/tmp/registry')
const wasm = await registry.pull('quay.io/cardil/cloudevents-pretty-print')

console.log({ wasm })
```

The above will download the WASM file, from the image, and place it in the 
`/tmp/registry` dir.

```
{
  wasm: WasmImage {
    image: Image {
      registry: 'quay.io',
      name: 'cardil/cloudevents-pretty-print',
      tag: 'latest',
      hash: undefined
    },
    file: '/tmp/registry/cardil-cloudevents-pretty-print-latest.wasm'
  }
}
```

The file is checked, after the wire transfer to have a proper checksum.

### Pushing WASM modules

Not yet implemented

## Contributing

See the [CONTRIBUTING.md](./CONTRIBUTING.md) file.
