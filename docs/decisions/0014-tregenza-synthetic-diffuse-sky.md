# 0014: Tregenza patches and normalized synthetic diffuse skies

## Status

Accepted during Milestone 10.

## Context

Diffuse exposure needs explicit directional radiance and must reproduce the
climate model's diffuse-horizontal irradiance (DHI) before visibility is added.
The first climate inputs also need to be understandable without suggesting that
cloud probability alone is measured irradiance data.

## Decision

- Discretize the hemisphere into the standard 145 Tregenza patches, storing a
  unit direction and exact ring solid angle for every patch.
- Keep the direct solar disk separate from diffuse patch radiance.
- Introduce a climate-model interface that provides DNI, DHI, and per-patch sky
  radiance for a simulation instant and an explicit clear or overcast state.
- Start with a labeled synthetic model. Its clear sky has circumsolar and horizon
  brightening; its overcast sky uses a zenith-brightening gradation. Normalize
  both discrete distributions so cosine-weighted integration equals their DHI.
- Represent accumulated cloud assumptions as an editable piecewise-linear
  probability curve over apparent local solar time. Integrate the deterministic
  expected value `(1 - p) * clear + p * overcast`, rather than sampling random
  weather sequences.
- Reuse the CPU optical-crossing implementation for each diffuse direction so
  ignored, opaque, and constant-transmissive objects retain the same meaning as
  direct exposure.

## Consequences

The patch system, climate assumptions, temporal integration, and visibility are
independently testable. The synthetic values are illustrative climatology, not a
replacement for EPW/TMY or measured DNI/DHI. A Perez all-weather or weather-data
model can implement the same interface later without changing surface sampling.
