export interface SkyPatch {
  readonly id: string
  readonly index: number
  readonly altitudeRadians: number
  /** Clockwise from true north. */
  readonly azimuthRadians: number
  readonly solidAngleSteradians: number
  readonly direction: {
    readonly east: number
    readonly up: number
    readonly north: number
  }
}

const DEGREES_TO_RADIANS = Math.PI / 180

/**
 * Generates the standard 145-patch Tregenza hemisphere. Rings run from the
 * horizon to the zenith and contain 30, 30, 24, 24, 18, 12, 6, and 1 patches.
 */
export function generateTregenzaSkyPatches(): readonly SkyPatch[] {
  const ringCounts = [30, 30, 24, 24, 18, 12, 6, 1] as const
  const patches: SkyPatch[] = []

  ringCounts.forEach((count, ringIndex) => {
    const lowerAltitude = ringIndex * 12 * DEGREES_TO_RADIANS
    const upperAltitude = Math.min(
      (ringIndex + 1) * 12,
      90,
    ) * DEGREES_TO_RADIANS
    const altitude = (lowerAltitude + upperAltitude) / 2
    const solidAngle = 2 * Math.PI * (
      Math.sin(upperAltitude) - Math.sin(lowerAltitude)
    ) / count
    // Alternating half-segment offsets avoid lining up every ring boundary.
    const offset = ringIndex % 2 === 0 && count > 1 ? Math.PI / count : 0

    for (let azimuthIndex = 0; azimuthIndex < count; azimuthIndex += 1) {
      const azimuth = count === 1
        ? 0
        : offset + azimuthIndex * 2 * Math.PI / count
      const horizontal = Math.cos(altitude)
      patches.push({
        id: `tregenza.${ringIndex}.${azimuthIndex}`,
        index: patches.length,
        altitudeRadians: altitude,
        azimuthRadians: azimuth,
        solidAngleSteradians: solidAngle,
        direction: {
          east: Math.sin(azimuth) * horizontal,
          up: Math.sin(altitude),
          north: Math.cos(azimuth) * horizontal,
        },
      })
    }
  })

  return patches
}

export const TREGENZA_SKY_PATCHES = generateTregenzaSkyPatches()
