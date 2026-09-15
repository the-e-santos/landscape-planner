# Terrain linear constraints

## Status

Accepted for Milestone 4F.

## Decision

Grade breaks, ridges, and swales are authoritative linear constraints composed
from ordered references to spot-elevation IDs. They do not duplicate point
coordinates or elevations. Each constraint has its own stable ID, semantic role,
name, and measurement source.

The terrain entity's `linearConstraints` collection is optional in schema version
1 and defaults to empty when absent, preserving compatibility with projects
created before Milestone 4F. Newly created terrain entities write an explicit
empty collection.

Commands add, replace, and remove whole constraints by ID. Validation reports
identity conflicts, insufficient polylines, missing spot references, and repeated
spot references. Removing a referenced spot does not silently delete or rewrite
a constraint; it leaves an explicit validation issue for the user to resolve.

This increment defines authoritative intent only. The current point-only Delaunay
mesh does not yet enforce these lines as triangle edges. Constrained
triangulation and visual constraint editing follow in later Milestone 4 work.
