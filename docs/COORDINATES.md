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

`northRotation` will be introduced with source alignment or the versioned project
schema. Until then, the local axes are aligned to true north and the red world-space
arrow points along `-Z`.
