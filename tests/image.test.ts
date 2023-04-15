import { describe, expect, test } from '@jest/globals'
import { Image, InvalidImageSpec } from '../src/image'

describe('Image', () => {
  describe('parse', () => {
    test('valid full spec', () => {
      const image = 'docker.io/library/alpine:3.12@sha256:deadbee1234567890abcdef'
      const im = Image.parse(image)
      expect(im.registry).toBe('docker.io')
      expect(im.name).toBe('library/alpine')
      expect(im.tag).toBe('3.12')
      expect(im.hash).toBe('deadbee1234567890abcdef')
    })

    test('valid no registry', () => {
      const image = 'alpine:3'
      const ref = Image.parse(image)
      expect(ref.registry).toBe('docker.io')
      expect(ref.name).toBe('library/alpine')
      expect(ref.tag).toBe('3')
      expect(ref.hash).toBeUndefined()
    })

    test('empty', () => {
      const image = ''
      
      expect(() => Image.parse(image)).toThrow(InvalidImageSpec)
    })
  })

  describe('toString', () => {
    const ref = new Image('alpine')
    const str = ref.toString()
    expect(str).toBe('docker.io/library/alpine:latest')
  })
})

