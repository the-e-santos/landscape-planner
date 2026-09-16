# 0013: Accumulated direct exposure uses clustered weighted directions

## Status

Accepted during Milestone 9.

## Context

Tracing every surface sample at every temporal sample would repeat visibility
work unnecessarily and would not support responsive refinement after geometry
changes. Accumulated results also need to remain physically distinct from
instantaneous irradiance.

## Decision

- Sample an inclusive Gregorian date range in apparent local solar time using
  midpoint temporal samples. Civil-time conversion remains deferred because it
  requires longitude and time-zone rules.
- Use the user-entered DNI as a constant synthetic input at every above-horizon
  sample. This is deliberately labeled in the UI and is not a climate model.
- Assign temporal sun samples to deterministic Fibonacci-hemisphere bins. Sum
  direct-normal energy in kWh/m² per bin and use the normalized energy-weighted
  mean as its representative direction. Direction clustering preserves total
  direct-normal energy.
- Keep instantaneous irradiance (`W/m²`) and accumulated radiant exposure
  (`kWh/m²`) as separate typed quantities and display units.
- Calculate accumulated layers progressively: a coarse pass with at most 24
  directions, an interactive pass with at most 64, and the requested final
  spacing and direction count. Remove duplicate stages when the target is
  already coarse.
- Run every surface-evaluation stage in a cancellable Web Worker. A geometry or
  settings update terminates stale work before starting a replacement pass.
- Partition sampled surfaces into stable 8 m plan tiles. Project conservative
  old/new primitive bounding spheres opposite every active illumination
  direction down to the lowest sampled elevation. Reevaluate dirty and newly
  occupied tiles while reusing unchanged sample values when topology and quality
  match.
- Report stage, spacing, direction count, temporal samples, surface samples,
  evaluated samples, units, and dirty/total tile counts in the analysis panel.

## Consequences

Moving an object can update a subset of a completed result without retracing
unaffected tiles, while edits to terrain, parcel geometry, time, quality, or
display settings conservatively invalidate the full result. Very low sun angles
can legitimately dirty most or all tiles because their possible shadows are
long. The constant-DNI model is useful for validating the accumulation and
visibility architecture but must not be presented as weather-derived exposure;
the climate abstraction and anisotropic diffuse sky remain Milestone 10 work.
