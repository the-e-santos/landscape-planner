# Retaining-wall profiles and faces

## Decision

Retaining walls are authoritative terrain inputs stored separately from ordinary
spot elevations. Each wall contains ordered upper and lower profiles with the
same number of corresponding points. Corresponding points share east/north plan
coordinates but carry separate elevations.

The ordered profile also stores an `upperSide` value. `left` and `right` are
interpreted while traveling from the first station toward the last in the local
east/north plane. This makes the higher adjoining terrain side explicit.

Each wall records measurement source plus horizontal and vertical uncertainty.
The terrain entity's optional `retainingWalls` collection is an additive schema-v1
extension; a missing collection is treated as empty.

Vertical wall faces are disposable derived data. Each profile segment becomes a
quad represented by two triangles. Three.js meshes, materials, and edge lines
remain scene projections and are never persisted.

Wall station plan positions also participate in constrained terrain
triangulation. The derived terrain duplicates each station into upper and lower
vertices. Triangles on the configured higher side use the upper copies, while
triangles on the opposite side use the lower copies. This produces a sharp
discontinuity whose open edge corresponds exactly to the separately derived wall
face.

Upper and lower elevations may meet at profile endpoints so an internal wall can
taper into continuous terrain without extending a crack beyond its end. A wall
must retain positive height at least at one station, and the upper profile may
never fall below the lower profile.

At a multi-segment bend, a triangle incident to a wall station is assigned using
the nearest profile segment. This deterministic local rule keeps the configured
left/right meaning through bends without persisting derived region membership.

## Rationale

Ordinary spot elevations intentionally reject duplicate horizontal positions,
while a retaining-wall discontinuity requires two elevations at the same plan
position. Separate paired profiles represent that discontinuity without weakening
the continuous-terrain point rules or making render geometry authoritative.

Derived wall faces still require parcel clipping when a profile crosses or lies
outside the nominal parcel. Authoritative profile inputs will remain unchanged
by that later clipping step.
