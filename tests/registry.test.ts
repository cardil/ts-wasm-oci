import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { WasmRegistry } from '../src/registry'
import nock from 'nock'
import { Readable } from 'stream'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Image, WasmImage } from '../src/image'

const cloudeventsImageName = 'quay.io/cardil/cloudevents-pretty-print'
const cloudeventsImage = Image.parse(cloudeventsImageName)
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
    test('cloudevents image', async () => {
      const reg = new WasmRegistry(workdir)
      const wasm = new WasmImage(
        cloudeventsImage,
        `${workdir}/cloudevents-pretty-print.wasm`
      )
      await expect(reg.push(wasm))
        .rejects.toThrow('Not implemented')
    })
  })

  describe('pull', () => {
    test('cloudevents image', async () => {
      nockCloudEventsPrettyPrint(nockForImage(cloudeventsImage), cloudeventsImage)

      const reg = new WasmRegistry(workdir)

      const wasm = await reg.pull(cloudeventsImage)

      expect(wasm.file).toBeDefined()
    })

    test('invalid workdir', async () => {
      const noAccess = `${workdir}/no-access`

      await fs.mkdir(noAccess, { mode: 0o500 })

      const reg = new WasmRegistry(noAccess)

      try {
        await expect(reg.pull(cloudeventsImage))
          .rejects.toThrow('Invalid workdir')
      } finally {
        await fs.chmod(noAccess, 0o700)
      }
    })

    test('non-existing workdir', async () => {
      nockCloudEventsPrettyPrint(nockForImage(cloudeventsImage), cloudeventsImage)

      const notExists = `${workdir}/not-exists`

      const reg = new WasmRegistry(notExists)

      const wasm = await reg.pull(cloudeventsImage)

      expect(wasm.file).toBeDefined()
    })

    test('registry outage', async () => {
      nockForImage(cloudeventsImage)
        .get('/v2/')
        .reply(500)

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(cloudeventsImage))
        .rejects.toThrow('Failed to ping registry: quay.io: HTTP 500 Internal Server Error')
    })

    test('invalid image (size)', async () => {
      const scope = nockForImage(cloudeventsImage)
      nockCloudEventsPrettyPrint(scope, cloudeventsImage)

      replaceNockedBlob(scope, cloudeventsImage)
        .reply(200, Buffer.from([0xDE, 0xAD, 0xBE]))

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(cloudeventsImage))
        .rejects.toThrow('Invalid image')
    })

    test('invalid image (digest)', async () => {
      const scope = nockForImage(cloudeventsImage)
      nockCloudEventsPrettyPrint(scope, cloudeventsImage)

      replaceNockedBlob(scope, cloudeventsImage)
        .reply(200, Buffer.from([0xDE, 0xAD, 0xBE, 0xEE]))

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(cloudeventsImage))
        .rejects.toThrow('Invalid image')
    })

    test('invalid image (not wasm)', async () => {
      const scope = nockForImage(cloudeventsImage)
      nockCloudEventsPrettyPrint(scope, cloudeventsImage)

      replaceNockedManifest(scope, cloudeventsImage)
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

      await expect(reg.pull(cloudeventsImage)).rejects.toThrow(
        'Invalid image "quay.io/cardil/cloudevents-pretty-print:latest": ' +
        'Want WASM media type, got: ' +
        '"application/vnd.docker.image.rootfs.diff.tar.gzip"'
      )
    })

    test('invalid image (more then one layer)', async () => {
      const scope = nockForImage(cloudeventsImage)
      nockCloudEventsPrettyPrint(scope, cloudeventsImage)

      replaceNockedManifest(scope, cloudeventsImage)
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

      await expect(reg.pull(cloudeventsImage)).rejects.toThrow(
        'Invalid image "quay.io/cardil/cloudevents-pretty-print:latest": ' +
        'Want one layer, got: 2'
      )
    })

    test('failed to download blob (server error)', async () => {
      const scope = nockForImage(cloudeventsImage)
      nockCloudEventsPrettyPrint(scope, cloudeventsImage)

      replaceNockedBlob(scope, cloudeventsImage)
        .reply(500, 'Internal Server Error')

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(cloudeventsImage))
        .rejects.toThrow('Failed to fetch blob: HTTP 500 Internal Server Error')
    })

    test('failed to download blob (broken pipe)', async () => {
      const scope = nockForImage(cloudeventsImage)
      nockCloudEventsPrettyPrint(scope, cloudeventsImage)

      replaceNockedBlob(scope, cloudeventsImage)
        .reply(200, () => {
          const reader = Readable.from(Buffer.from([0xDE, 0xAD]))
          reader.on('end', () => {
            reader.destroy(new Error('Broken pipe'))
          })
          return reader
        })

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(cloudeventsImage))
        .rejects.toThrow('Failed to fetch blob: Error: Broken pipe')
    })
  })
})

function replaceNockedManifest(scope: nock.Scope, im: Image): nock.Interceptor {
  nock.removeInterceptor({
    proto: 'https',
    hostname: im.registry,
    method: 'GET',
    path: `/v2/${im.name}/manifests/${im.tag}`,
  })
  return scope.get(`/v2/${im.name}/manifests/${im.tag}`)
    .matchHeader('authorization', `Bearer ${token}`)
    .matchHeader('accept', 'application/vnd.oci.image.manifest.v1+json')
}

function replaceNockedBlob(scope: nock.Scope, im: Image): nock.Interceptor {
  nock.removeInterceptor({
    proto: 'https',
    hostname: im.registry,
    method: 'GET',
    path: `/v2/${im.name}/blobs/sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953`,
  })
  return scope.get(`/v2/${im.name}/blobs/sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953`)
    .matchHeader('authorization', `Bearer ${token}`)
}

function nockForImage(im: Image): nock.Scope {
  const host = im.registry
  const headers = {
    'Docker-Distribution-API-Version': 'registry/2.0'
  }
  return nock(`https://${host}`, { reqheaders: headers })
}

function nockCloudEventsPrettyPrint(scope: nock.Scope, im: Image) {
  const headers = {
    'Docker-Distribution-API-Version': 'registry/2.0'
  }
  const host = im.registry

  scope.get('/v2/')
    .reply(401, 'true', {
      ...headers, ...{
        'WWW-Authenticate': `Bearer realm="https://${host}/v2/auth",service="${host}"`
      }
    })

  scope.get('/v2/auth')
    .query({ scope: `repository:${im.name}:pull`, service: host })
    .reply(200, { token })

  scope.get(`/v2/${im.name}/manifests/${im.tag}`)
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

  scope.get(`/v2/${im.name}/blobs/sha256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953`)
    .matchHeader('authorization', `Bearer ${token}`)
    .reply(200, Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]))
}
