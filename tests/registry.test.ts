import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { WasmRegistry } from '../src/registry'
import nock from 'nock'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Image, WasmImage } from '../src/image'

const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IldrbGpPVE1GN1' +
  'hhbS1qQ1J6eHhBY2lTQTRmU3pFbjlDQm5fU3c5bXBnSW8ifQ'

describe('WasmRegistry', () => {
  const image = 'quay.io/cardil/cloudevents-pretty-print'
  let workdir: string

  beforeEach(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'jest-temp-'))
  })

  afterEach(async () => {
    await fs.rm(workdir, { recursive: true })
    nock.cleanAll()
  })

  describe('push', () => {
    test(image, async () => {
      const reg = new WasmRegistry(workdir)
      const wasm = new WasmImage(
        Image.parse(image),
        `${workdir}/cloudevents-pretty-print.wasm`
      )
      await expect(reg.push(wasm))
        .rejects.toThrow('Not implemented')
    })
  })

  describe('pull', () => {
    test(image, async () => {
      mockRegistry(image)

      const reg = new WasmRegistry(workdir)

      const wasm = await reg.pull(image)

      expect(wasm.file).toBeDefined()
    })

    test('invalid workdir', async () => {
      const noAccess = `${workdir}/no-access`

      await fs.mkdir(noAccess, { mode: 0o500 })

      const reg = new WasmRegistry(noAccess)

      try {
        await expect(reg.pull(image))
          .rejects.toThrow('Invalid workdir')
      } finally {
        await fs.chmod(noAccess, 0o700)
      }
    })

    test('non-existing workdir', async () => {
      mockRegistry(image)

      const notExists = `${workdir}/not-exists`

      const reg = new WasmRegistry(notExists)

      const wasm = await reg.pull(image)

      expect(wasm.file).toBeDefined()
    })

    test('invalid image', async () => {
      const scope = mockRegistry(image)

      const ref = Image.parse(image)

      nock.removeInterceptor({
        proto: 'https',
        hostname: ref.registry,
        method: 'GET',
        path: `/v2/${ref.name}/blobs/sha256:d729cf656675baeae45c382f31e6ad97486ddb2818f259d0ef68276e56e76712`,
      })
      scope.get(`/v2/${ref.name}/blobs/sha256:d729cf656675baeae45c382f31e6ad97486ddb2818f259d0ef68276e56e76712`)
        .matchHeader('authorization', `Bearer ${token}`)
        .reply(200, Buffer.from([0xDE, 0xAD, 0xBE]))

      const reg = new WasmRegistry(workdir)

      await expect(reg.pull(image))
        .rejects.toThrow('Invalid image')
    })
  })
})

function mockRegistry(image: string): nock.Scope {
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
        digest: 'sha256:d729cf656675baeae45c382f31e6ad97486ddb2818f259d0ef68276e56e76712',
        size: 4,
        annotations: {
          'org.opencontainers.image.title': 'target/wasm32-wasi/release/cloudevents_pretty_print.wasm'
        }
      }]
    }, {
      'Docker-Content-Digest': 'sha256:01b30983dda5eb42a8baefb523eb50d7d0e539fb10d7ab9498a2a59f35036afb',
      'Content-Type': 'application/vnd.oci.image.manifest.v1+json'
    })

  scope.get(`/v2/${ref.name}/blobs/sha256:d729cf656675baeae45c382f31e6ad97486ddb2818f259d0ef68276e56e76712`)
    .matchHeader('authorization', `Bearer ${token}`)
    .reply(200, Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]))

  return scope
}

