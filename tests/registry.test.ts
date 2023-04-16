import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { WasmRegistry } from '../src/registry'
import nock from 'nock'
import { Readable } from 'stream'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Image, WasmImage } from '../src/image'

const imageName = 'quay.io/cardil/cloudevents-pretty-print'
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IldrbGpPVE1GN1' +
  'hhbS1qQ1J6eHhBY2lTQTRmU3pFbjlDQm5fU3c5bXBnSW8ifQ'

describe('WasmRegistry', () => {
  let workdir: string

  beforeEach(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'jest-temp-'))
  })

  afterEach(async () => {
    await fs.rm(workdir, { recursive: true })
    nock.cleanAll()
  })

  describe('push', () => {
    test(imageName, async () => {
      const reg = new WasmRegistry(workdir)
      const wasm = new WasmImage(
        Image.parse(imageName),
        `${workdir}/cloudevents-pretty-print.wasm`
      )
      await expect(reg.push(wasm))
        .rejects.toThrow('Not implemented')
    })
  })

  describe('pull', () => {
    test(imageName, async () => {
      nockRegistry(imageName)

      const reg = new WasmRegistry(workdir)

      const wasm = await reg.pull(imageName)

      expect(wasm.file).toBeDefined()
    })

    test('invalid workdir', async () => {
      const noAccess = `${workdir}/no-access`

      await fs.mkdir(noAccess, { mode: 0o500 })

      const reg = new WasmRegistry(noAccess)

      try {
        await expect(reg.pull(imageName))
          .rejects.toThrow('Invalid workdir')
      } finally {
        await fs.chmod(noAccess, 0o700)
      }
    })

    test('non-existing workdir', async () => {
      nockRegistry(imageName)

      const notExists = `${workdir}/not-exists`

      const reg = new WasmRegistry(notExists)

      const wasm = await reg.pull(imageName)

      expect(wasm.file).toBeDefined()
    })

    test('registry outage', async () => {
      setupNockForImage(imageName)
        .get('/v2/')
        .reply(500)

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName))
        .rejects.toThrow('Failed to ping registry: quay.io: HTTP 500 Internal Server Error')
    })

    test('invalid image (size)', async () => {
      const scope = nockRegistry(imageName)

      const im = Image.parse(imageName)

      replaceNockedBlob(scope, im)
        .reply(200, Buffer.from([0xDE, 0xAD, 0xBE]))

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName))
        .rejects.toThrow('Invalid image')
    })

    test('invalid image (digest)', async () => {
      const scope = nockRegistry(imageName)

      const im = Image.parse(imageName)

      replaceNockedBlob(scope, im)
        .reply(200, Buffer.from([0xDE, 0xAD, 0xBE, 0xEE]))

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName))
        .rejects.toThrow('Invalid image')
    })

    test('invalid image (not wasm)', async () => {
      const scope = nockRegistry(imageName)

      const im = Image.parse(imageName)

      replaceNockedManifest(scope, im)
        .reply(200, {
          schemaVersion: 2,
          config: {
            mediaType: 'application/vnd.docker.container.image.v1+json',
            digest: 'sha256:cbc2c84460390a6bd5434e64bca45da2e169c6b6801a35f3e52f70100d1cdf1f',
            size: 24298,
          },
          layers: [{
            mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
            digest: 'sha256:929e4396e5691723bf4de56a1395b2bc62fe51daaf4f5c3aeea8f4db803c9b69',
            size: 39283472,
          }]
        }, {
          'Docker-Content-Digest': 'sha256:01b30983dda5eb42a8baefb523eb50d7d0e539fb10d7ab9498a2a59f35036afb',
          'Content-Type': 'application/vnd.oci.image.manifest.v1+json'
        })

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName)).rejects.toThrow(
        'Invalid image "quay.io/cardil/cloudevents-pretty-print:latest": '+
        'Want media type "application/vnd.wasm.content.layer.v1+wasm", '+
        'got: "application/vnd.docker.image.rootfs.diff.tar.gzip"'
      )
    })

    test('invalid image (more then one layer)', async () => {
      const scope = nockRegistry(imageName)

      const im = Image.parse(imageName)

      replaceNockedManifest(scope, im)
        .reply(200, {
          schemaVersion: 2,
          config: {
            mediaType: 'application/vnd.docker.container.image.v1+json',
            digest: 'sha256:cbc2c84460390a6bd5434e64bca45da2e169c6b6801a35f3e52f70100d1cdf1f',
            size: 24298,
          },
          layers: [{
            mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
            digest: 'sha256:929e4396e5691723bf4de56a1395b2bc62fe51daaf4f5c3aeea8f4db803c9b69',
            size: 39283472,
          }, {
            mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
            size: 90764028,
            digest: 'sha256:cb271f0b185ddfe8730bd4162892db1fc3dd9cba6ef082da8d1a7c14f05d16c1'
          }]
        }, {
          'Docker-Content-Digest': 'sha256:01b30983dda5eb42a8baefb523eb50d7d0e539fb10d7ab9498a2a59f35036afb',
          'Content-Type': 'application/vnd.oci.image.manifest.v1+json'
        })

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName)).rejects.toThrow(
        'Invalid image "quay.io/cardil/cloudevents-pretty-print:latest": '+
        'Want one layer, got: 2'
      )
    })

    test('failed to download blob (server error)', async () => {
      const scope = nockRegistry(imageName)

      const im = Image.parse(imageName)

      replaceNockedBlob(scope, im)
        .reply(500, 'Internal Server Error')
      
      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName))
        .rejects.toThrow('Failed to fetch blob: HTTP 500 Internal Server Error')
    })

    test('failed to download blob (broken pipe)', async () => {
      const scope = nockRegistry(imageName)

      const im = Image.parse(imageName)

      replaceNockedBlob(scope, im)
        .reply(200, () => {
          const reader = Readable.from(Buffer.from([0xDE, 0xAD]))
          reader.on('end', () => {
            reader.destroy(new Error('Broken pipe'))
          })
          return reader
        })
      
      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(imageName))
        .rejects.toThrow('Failed to fetch blob: Error: Broken pipe')
    })
  })
})

function replaceNockedManifest(scope: nock.Scope, ref: Image) : nock.Interceptor {
  nock.removeInterceptor({
    proto: 'https',
    hostname: ref.registry,
    method: 'GET',
    path: `/v2/${ref.name}/manifests/${ref.tag}`,
  })
  return scope.get(`/v2/${ref.name}/manifests/${ref.tag}`)
  .matchHeader('authorization', `Bearer ${token}`)
  .matchHeader('accept', 'application/vnd.oci.image.manifest.v1+json')
}

function replaceNockedBlob(scope: nock.Scope, ref: Image) : nock.Interceptor {
  nock.removeInterceptor({
    proto: 'https',
    hostname: ref.registry,
    method: 'GET',
    path: `/v2/${ref.name}/blobs/sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953`,
  })
  return scope.get(`/v2/${ref.name}/blobs/sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953`)
    .matchHeader('authorization', `Bearer ${token}`)
}

function setupNockForImage(image: string): nock.Scope {
  const ref = Image.parse(image)
  const host = ref.registry
  const headers = {
    'Docker-Distribution-API-Version': 'registry/2.0'
  }
  return nock(`https://${host}`, { reqheaders: headers })
}

function nockRegistry(image: string): nock.Scope {
  const ref = Image.parse(image)
  const host = ref.registry
  const headers = {
    'Docker-Distribution-API-Version': 'registry/2.0'
  }
  const scope = nock(`https://${host}`, { reqheaders: headers })

  scope.get('/v2/')
    .reply(401, 'true', headers)

  scope.get('/v2/auth')
    .query({ scope: `repository:${ref.name}:pull`, service: host })
    .reply(200, { token })

  scope.get(`/v2/${ref.name}/manifests/${ref.tag}`)
    .matchHeader('authorization', `Bearer ${token}`)
    .matchHeader('accept', 'application/vnd.oci.image.manifest.v1+json')
    .reply(200, {
      schemaVersion: 2,
      config: {
        mediaType: 'application/vnd.wasm.config.v1+json',
        digest: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        size: 2
      },
      layers: [{
        mediaType: 'application/vnd.wasm.content.layer.v1+wasm',
        digest: 'sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953',
        size: 4,
        annotations: {
          'org.opencontainers.image.title': 'target/wasm32-wasi/release/cloudevents_pretty_print.wasm'
        }
      }]
    }, {
      'Docker-Content-Digest': 'sha256:01b30983dda5eb42a8baefb523eb50d7d0e539fb10d7ab9498a2a59f35036afb',
      'Content-Type': 'application/vnd.oci.image.manifest.v1+json'
    })

  scope.get(`/v2/${ref.name}/blobs/sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953`)
    .matchHeader('authorization', `Bearer ${token}`)
    .reply(200, Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]))

  return scope
}

