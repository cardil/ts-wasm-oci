import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { WasmRegistry } from '../src/registry'
import { Image } from '../src/image'

const debug = process.env.NODE_OPTIONS?.includes('debug')
const maybe = debug || process.env.JEST_PROFILE == 'e2e' ? describe : describe.skip

const timeout = 90_000 // 90 seconds

maybe('e2e', () => {
  let workdir: string

  beforeEach(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'jest-temp-'))
  })

  afterEach(async () => {
    await fs.rm(workdir, { recursive: true })
  })

  describe('WasmRegistry', () => {
    describe('pull', () => {
      test('cloudevents image', async () => {
        const reg = new WasmRegistry(workdir)

        const imageName = 'quay.io/cardil/cloudevents-pretty-print'
        const imageSpec = Image.parse(imageName)
        const wasm = await reg.pull(imageSpec)

        expect(wasm.file).toBeDefined()
      }, timeout)

      test('reverse-text image', async () => {
        const reg = new WasmRegistry(workdir)

        const imageName = 'quay.io/cardil/knative/serving/wasm/example/reverse-text'
        const imageSpec = Image.parse(imageName)
        const wasm = await reg.pull(imageSpec)

        expect(wasm.file).toBeDefined()
      }, timeout)
    })
  })
})
