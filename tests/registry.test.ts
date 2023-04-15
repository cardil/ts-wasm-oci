import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { createWasmRegistry } from '../src/registry'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

describe('WasmRegistry', () => {
  describe('pull', () => {
    const image = 'quay.io/cardil/cloudevents-pretty-print'

    let workdir: string

    beforeEach(async () => {
      workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'jest-temp-'))
    })

    afterEach(async () => {
      await fs.rm(workdir, { recursive: true })
    })

    test(image, async () => {
      const reg = await createWasmRegistry(workdir)

      const wasm = await reg.pull(image)

      expect(wasm.file).toBeDefined()
    })
  })
})
