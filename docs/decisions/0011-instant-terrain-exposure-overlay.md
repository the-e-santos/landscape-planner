# 0011: Instant terrain exposure uses a disposable sampled overlay

## Status

Accepted during the first Milestone 8 increment.

## Context

The derived terrain triangulation is intentionally sparse and cannot show useful
primitive shadows through vertex colors alone. The first heatmap should reuse the
CPU point solver without turning visualization data into authoritative project
state or introducing a general atlas system prematurely.

## Decision

- Subdivide each clipped terrain triangle into a deterministic barycentric grid.
  The longest triangle edge determines the subdivision count for the selected
  2 m, 1 m, or 0.5 m nominal spacing.
- Evaluate instantaneous direct irradiance at every sampled vertex with the CPU
  point solver, using the triangle's geometric normal and a small outward origin
  offset.
- Render a disposable, vertex-colored mesh slightly above the terrain. Map zero
  through the selected DNI to a fixed dark-blue, teal, and yellow scale. Retain
  W/m² values in the generated layer so display colors do not replace numerical
  results.
- Keep the overlay off by default and recompute it from current domain state. Hide
  it during primitive manipulation and rebuild it when the manipulation ends.

## Consequences

Users can inspect an immediate terrain shadow layer and compare it with the point
reference. Color interpolation makes the result continuous-looking but does not
increase numerical resolution; the selected spacing remains visible in the UI.
This increment samples terrain only. Primitive surface atlases, probe selection,
diffuse channels, tiling, workers, and progressive refinement remain future work.
