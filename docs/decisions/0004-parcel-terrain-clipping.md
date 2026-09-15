# Parcel terrain clipping

## Status

Accepted for Milestone 4E.

## Decision

The disposable derived terrain mesh is clipped to the nominal parcel polygon.
Authoritative spot elevations are neither deleted nor moved when they fall
outside that polygon, and their markers remain visible for later editing.

Convex parcels directly clip each terrain triangle. Concave simple parcels are
first deterministically ear-triangulated into convex clip regions. Redundant
collinear boundary points are removed for the calculation, so inserting a parcel
midpoint does not change the surface until that point is moved. Self-intersecting,
non-finite, and zero-area parcel boundaries do not produce a clipped mesh.

Clipping uses an explicit coordinate tolerance of `1e-9` meters and projected
area tolerance of `1e-10` square meters. Generated boundary vertices interpolate
elevation within their source terrain triangle. The clipped output is derived
geometry and is not serialized.
