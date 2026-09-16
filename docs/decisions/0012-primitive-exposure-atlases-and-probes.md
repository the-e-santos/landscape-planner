# 0012: Primitive exposure atlases use parametric surface meshes

## Status

Accepted during Milestone 8.

## Context

Instant exposure must be visible and queryable on every supported primitive, not
only on terrain. The authoritative primitive geometries already provide stable
parameterizations, so the first atlas does not need texture unwrapping or a mesh
import pipeline.

## Decision

- Generate disposable local-space surface meshes for all supported primitives:
  six face grids for boxes and walls, radial side/cap grids for cylinders,
  latitude/longitude grids for ellipsoidal canopies, and ear-clipped top/bottom
  triangles plus edge grids for polygon extrusions.
- Size subdivisions from the selected nominal surface spacing. Keep duplicate
  vertices where a sharp edge requires different surface normals. Cylinder and
  canopy atlases match the rendered geometry's minimum angular tessellation so a
  coarse overlay does not dip inside the visible mesh and create striped
  occlusion artifacts.
- Transform each sample into project space for the CPU point query, excluding its
  owning primitive from self-occlusion. Retain local positions for rendering so
  the overlay follows the ordinary domain-derived primitive view.
- Represent direct, diffuse, and total as separate values and display channels.
  Diffuse is explicitly zero in Milestone 8, so total currently equals direct;
  the UI labels this as a placeholder rather than implying a complete sky model.
- In probe mode, ray-pick the underlying terrain or primitive surface, show a
  point/normal marker, and send the world position, normal, and owning entity ID
  to the same numerical CPU reference query.

## Consequences

The heatmap is quantitative at sampled vertices and interpolated between them.
Nominal spacing down to 0.1 m is visible in the UI. Solar state and primitive
extraction are prepared once per pass for repeated point evaluation. Sampling remains synchronous and
whole-surface in this milestone; workers, tiles, progressive refinement, and
spatial invalidation begin with accumulated exposure in Milestone 9. Imported
meshes remain unsupported.
