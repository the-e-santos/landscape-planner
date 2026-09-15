# Coordinate and unit conventions

Landscape Planner stores geometry in a local Cartesian coordinate system using
meters:

- `+X` is east.
- `+Y` is up.
- `-Z` is north.

Parcel boundaries use two-dimensional `eastMeters` and `northMeters` values.
Rendering maps a parcel point to `(eastMeters, 0, -northMeters)` in Three.js.
This keeps domain data readable without changing the scene convention.

The current parcel origin is the center of a parameterized rectangle. Polygon
vertices connect in their listed order. Switching between meters and feet changes
only inputs and labels; stored values remain meters. One international foot is
exactly 0.3048 meters.

Boundary uncertainty is stored as a non-negative distance in meters. The rendered
corridor extends that distance to either side of each estimated boundary segment.
It communicates measurement uncertainty and is not a survey or setback boundary.

Terrain spot elevations store `eastMeters`, `northMeters`, and `elevationMeters`.
Elevation is local `+Y` relative to a project datum that will be defined by source
alignment. Horizontal and vertical uncertainty are stored separately because the
measurement qualities can differ. Triangulated terrain is derived from these
authoritative inputs and is not part of the persisted project state.

The versioned project schema stores `northRotationRadians`, measured around `+Y`
from local `-Z` to true north. It defaults to zero, so the red world-space arrow
points along `-Z` until source-alignment controls are introduced.
