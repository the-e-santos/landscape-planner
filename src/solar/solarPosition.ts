export interface SolarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

export interface SolarPositionInput {
  readonly date: SolarDate
  readonly latitudeRadians: number
  /** Apparent local solar time, where solar noon is exactly 12. */
  readonly localSolarTimeHours: number
}

export interface SolarPosition {
  readonly altitudeRadians: number
  /** Clockwise from true north in the horizontal plane. */
  readonly azimuthRadians: number
  readonly declinationRadians: number
  readonly hourAngleRadians: number
  readonly aboveHorizon: boolean
}

const DEGREES_TO_RADIANS = Math.PI / 180
const RADIANS_TO_DEGREES = 180 / Math.PI

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

function julianDayAtNoonUtc(date: SolarDate): number {
  const instant = Date.UTC(date.year, date.month - 1, date.day, 12)
  const normalized = new Date(instant)
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() + 1 !== date.month ||
    normalized.getUTCDate() !== date.day
  ) {
    throw new Error('Solar date must be a valid Gregorian calendar date')
  }
  return instant / 86_400_000 + 2_440_587.5
}

/**
 * Solar declination from the NOAA solar-calculation equations, which implement
 * the Meeus Julian-century series. Noon UTC is used because a civil instant
 * cannot be recovered from a date and local solar time without longitude.
 */
export function solarDeclinationRadians(date: SolarDate): number {
  const julianCentury = (julianDayAtNoonUtc(date) - 2_451_545) / 36_525
  const geometricMeanLongitude = normalizeDegrees(
    280.46646 + julianCentury * (36_000.76983 + 0.0003032 * julianCentury),
  )
  const geometricMeanAnomaly = normalizeDegrees(
    357.52911 + julianCentury * (35_999.05029 - 0.0001537 * julianCentury),
  ) * DEGREES_TO_RADIANS
  const equationOfCenter =
    Math.sin(geometricMeanAnomaly) *
      (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
    Math.sin(2 * geometricMeanAnomaly) *
      (0.019993 - 0.000101 * julianCentury) +
    Math.sin(3 * geometricMeanAnomaly) * 0.000289
  const trueLongitude = geometricMeanLongitude + equationOfCenter
  const omega = (125.04 - 1934.136 * julianCentury) * DEGREES_TO_RADIANS
  const apparentLongitude = (
    trueLongitude - 0.00569 - 0.00478 * Math.sin(omega)
  ) * DEGREES_TO_RADIANS
  const seconds = 21.448 - julianCentury * (
    46.815 + julianCentury * (0.00059 - julianCentury * 0.001813)
  )
  const meanObliquity = (
    23 + (26 + seconds / 60) / 60
  ) * DEGREES_TO_RADIANS
  const correctedObliquity = meanObliquity +
    0.00256 * DEGREES_TO_RADIANS * Math.cos(omega)

  return Math.asin(
    Math.sin(correctedObliquity) * Math.sin(apparentLongitude),
  )
}

export function calculateSolarPosition(
  input: SolarPositionInput,
): SolarPosition {
  if (
    !Number.isFinite(input.latitudeRadians) ||
    input.latitudeRadians < -Math.PI / 2 ||
    input.latitudeRadians > Math.PI / 2
  ) {
    throw new Error('Latitude must be between -90 and 90 degrees')
  }
  if (
    !Number.isFinite(input.localSolarTimeHours) ||
    input.localSolarTimeHours < 0 ||
    input.localSolarTimeHours > 24
  ) {
    throw new Error('Local solar time must be between 0 and 24 hours')
  }

  const declinationRadians = solarDeclinationRadians(input.date)
  const hourAngleRadians = (
    input.localSolarTimeHours - 12
  ) * 15 * DEGREES_TO_RADIANS
  const east = -Math.cos(declinationRadians) * Math.sin(hourAngleRadians)
  const north =
    Math.cos(input.latitudeRadians) * Math.sin(declinationRadians) -
    Math.sin(input.latitudeRadians) *
      Math.cos(declinationRadians) * Math.cos(hourAngleRadians)
  const up =
    Math.sin(input.latitudeRadians) * Math.sin(declinationRadians) +
    Math.cos(input.latitudeRadians) *
      Math.cos(declinationRadians) * Math.cos(hourAngleRadians)
  const altitudeRadians = Math.asin(Math.max(-1, Math.min(1, up)))
  const azimuthRadians = normalizeDegrees(
    Math.atan2(east, north) * RADIANS_TO_DEGREES,
  ) * DEGREES_TO_RADIANS

  return {
    altitudeRadians,
    azimuthRadians,
    declinationRadians,
    hourAngleRadians,
    aboveHorizon: altitudeRadians > 0,
  }
}

export function degreesToRadians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS
}

export function radiansToDegrees(radians: number): number {
  return radians * RADIANS_TO_DEGREES
}
