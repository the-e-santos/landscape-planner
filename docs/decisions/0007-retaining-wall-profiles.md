# Retaining-wall profiles and faces

## Decision

Retaining walls are authoritative terrain inputs stored separately from ordinary
spot elevations. Each wall contains ordered upper and lower profiles with the
same number of corresponding points. Corresponding points share east/north plan
coordinates but carry separate elevations.

The ordered profile also stores an `upperSide` value. `left` and `right` are
interpreted while traveling from the first station toward the last in the local
east/north plane. This makes the higher adjoining terrain side explicit for the
later continuous-region split.

Each wall records measurement source plus horizontal and vertical uncertainty.
The terrain entity's optional `retainingWalls` collection is an additive schema-v1
extension; a missing collection is treated as empty.

Vertical wall faces are disposable derived data. Each profile segment becomes a
quad represented by two triangles. Three.js meshes, materials, and edge lines
remain scene projections and are never persisted.

## Rationale

Ordinary spot elevations intentionally reject duplicate horizontal positions,
while a retaining-wall discontinuity requires two elevations at the same plan
position. Separate paired profiles represent that discontinuity without weakening
the continuous-terrain point rules or making render geometry authoritative.

## Increment boundary

This increment derives and renders explicit vertical wall faces. Splitting the
adjoining continuous terrain into upper and lower regions and clipping derived
wall faces to the parcel are follow-up work before Milestone 4 is complete.
