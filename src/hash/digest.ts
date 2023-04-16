import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { createReadStream } from 'fs'

export async function calcDigest(algorithm: string, file: string): Promise<string> {
  const hash = crypto.createHash(algorithm)
  const reader = createReadStream(file)
  await pipeline(reader, hash)
  return hash.digest('hex')
}
