# Constrained terrain edges

## Status

Accepted for Milestone 4G.

## Decision

Valid grade-break, ridge, and swale segments are enforced as edges in the derived
terrain triangulation. A requested segment passing through another spot elevation
is deterministically split at that spot. Existing constraint edges are locked,
and intersecting unconstrained edges are flipped until each requested edge is
present.

Constraints are processed in ID order so their array insertion order does not
affect the result. Triangle and vertex ordering retain the deterministic rules of
the point-only triangulation. If numerical or topological conditions prevent an
edge insertion, mesh derivation returns an explicit issue rather than silently
ignoring the constraint.

Constraint crossings and overlaps must be represented with an explicit shared
spot elevation. Validation rejects ambiguous intersections before triangulation.
This increment enforces topology but does not yet add distinct rendering or UI
for constraint semantics. The constrained mesh remains derived and is not
serialized.
