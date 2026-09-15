# Point terrain triangulation

## Status

Accepted for Milestone 4B.

## Decision

Valid spot elevations are converted into a derived point-only Delaunay mesh with
a small Bowyer–Watson implementation. It has no dependency on React, Three.js, or
the persisted project format. Spot inputs are sorted by east coordinate, north
coordinate, and ID before triangulation so equivalent input sets produce stable
vertex indices and triangles regardless of insertion order.

Triangles wind counter-clockwise in east/north coordinates. Because rendering
maps north to world `-Z`, this winding produces surfaces facing world `+Y`.
Derived vertices retain their source spot-elevation IDs, but uncertainty and
provenance remain attached to the authoritative inputs rather than being copied
into render geometry.

This increment does not claim constrained triangulation. Grade breaks, ridges,
swales, parcel clipping, retaining-wall discontinuities, and robust handling of
constraint intersections will extend or replace the point-only triangulation in
later Milestone 4 increments. The derived mesh remains disposable and is never
serialized as authoritative project state.
