import { describe, expect, it } from 'vitest'
import { generateTregenzaSkyPatches } from './skyPatches'

describe('Tregenza sky patches', () => {
  it('generates 145 unit directions covering exactly one hemisphere', () => {
    const patches = generateTregenzaSkyPatches()
    expect(patches).toHaveLength(145)
    expect(patches.reduce((sum, patch) => sum + patch.solidAngleSteradians, 0))
      .toBeCloseTo(2 * Math.PI, 12)
    patches.forEach((patch) => {
      expect(Math.hypot(
        patch.direction.east,
        patch.direction.up,
        patch.direction.north,
      )).toBeCloseTo(1, 12)
      expect(patch.direction.up).toBeGreaterThan(0)
      expect(patch.solidAngleSteradians).toBeGreaterThan(0)
    })
  })

  it('uses the standard horizon-to-zenith ring populations', () => {
    const patches = generateTregenzaSkyPatches()
    const populations = Array.from({ length: 8 }, (_, ring) =>
      patches.filter(({ id }) => id.startsWith(`tregenza.${ring}.`)).length
    )
    expect(populations).toEqual([30, 30, 24, 24, 18, 12, 6, 1])
  })
})
