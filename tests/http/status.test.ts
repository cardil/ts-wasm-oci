import { describe, test, expect } from '@jest/globals'
import { StatusCode } from '../../src/http/status'

describe('StatusCode', () => {
  test('equals', () => {
    expect(StatusCode.OK.equals(StatusCode.OK)).toBeTruthy()
    expect(StatusCode.OK.equals(StatusCode.CREATED)).toBeFalsy()
    expect(StatusCode.OK.equals('OK')).toBeFalsy()
    expect(StatusCode.OK.equals('foo')).toBeFalsy()
  })

  test('toString', () => {
    expect(StatusCode.OK.toString()).toEqual('HTTP 200 OK')
    expect(StatusCode.CREATED.toString()).toEqual('HTTP 201 Created')

    expect(new StatusCode(413).toString()).toEqual('HTTP 413 Unknown')
  })
})
