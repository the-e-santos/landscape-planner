# 0016: Synthetic daily irradiance and direct-sun duration

## Status

Accepted during Milestone 10.

## Context

Holding DNI and DHI constant at every above-horizon time exaggerates diffuse
energy near sunrise and sunset. Applying the same sine curve to both quantities
would also double-count the surface-incidence projection already present in the
direct solver. Horticultural comparisons benefit from both accumulated energy
and the geometrically distinct duration for which the solar disk is visible.

## Decision

- Interpret configured DNI as a reference at relative optical air mass one.
- Compute relative optical air mass from solar altitude using the Kasten–Young
  1989 approximation at sea-level pressure.
- Compute date-dependent extraterrestrial normal irradiance with a simple annual
  Earth–Sun distance correction. Derive broadband optical depth from the reference
  DNI and apply exponential air-mass attenuation at each temporal sample.
- Interpret configured DHI as a reference for the sun at zenith and scale it by
  `max(0, sin(solar altitude))`. Continue normalizing every discrete anisotropic
  sky state to the resulting instantaneous DHI.
- Keep surface incidence separate. Direct irradiance still includes
  `max(0, surface normal · sun direction)` exactly once.
- Report potential direct-sun duration when the surface faces the sun and path
  transmission is nonzero. This is independent of the synthetic cloud state.
- Also report transmission-weighted duration by accumulating `transmission × dt`.
  Thus, an hour below a 50% screen contributes one potential hour and 0.5 weighted
  hour, while an opaque blocker contributes neither.

## Consequences

The synthetic model now has a plausible daily envelope without exposing an
abstract optical-depth input. It remains a sea-level, broadband approximation,
not a location-specific weather model. Elevation/pressure, aerosols, humidity,
spectral PAR, and measured weather remain future climate-model concerns.
