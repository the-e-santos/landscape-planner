import { describe, expect, it } from 'vitest'
import {
  fromDisplayLength,
  METERS_PER_FOOT,
  toDisplayLength,
} from './units'

describe('length unit conversion', () => {
  it('leaves meter values unchanged', () => {
    expect(toDisplayLength(12.5, 'meters')).toBe(12.5)
    expect(fromDisplayLength(12.5, 'meters')).toBe(12.5)
  })

  it('converts feet to meters using the exact international foot', () => {
    expect(fromDisplayLength(1, 'feet')).toBe(METERS_PER_FOOT)
    expect(toDisplayLength(METERS_PER_FOOT, 'feet')).toBe(1)
  })

  it('round-trips a displayed length without changing stored units', () => {
    const meters = 37.42
    const displayedFeet = toDisplayLength(meters, 'feet')

    expect(fromDisplayLength(displayedFeet, 'feet')).toBeCloseTo(meters, 12)
  })
})
