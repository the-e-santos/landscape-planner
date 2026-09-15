# 0008: Parametric primitive object model

## Status

Accepted for Milestone 5A.

## Context

Primitive landscape objects must remain serializable and independent of the
Three.js scene graph. Their stored dimensions and transforms will later feed
surface sampling and solar visibility calculations, so rendered mesh scale
cannot be the authoritative representation.

## Decision

- Store primitive entities in the versioned project entity collection with a
  `primitive` discriminator and stable entity ID.
- Represent boxes, cylinders, wall/fence segments, polygon extrusions, and
  ellipsoidal canopies as a discriminated geometry union with positive SI
  dimensions. Geometry is centered on its local origin.
- Store wall and fence semantics separately from their shared segment dimensions.
  Store polygon-extrusion footprint vertices in the primitive's local horizontal
  coordinate frame; triangulation is derived by the scene view.
- Store the local-origin position using named `eastMeters`, `elevationMeters`,
  and `northMeters` values. Scene projection maps these to `(x, y, z)` as
  `(east, elevation, -north)`.
- Store intrinsic XYZ Euler rotations in radians. These axes are the project's
  local `+X`, `+Y`, and `+Z` axes (`+Z` is south), and use the `XYZ` order.
- Rebuild disposable Three.js geometry when authoritative primitive dimensions
  change. Do not persist a Three.js object, geometry, or scale.
- Keep schema version 1 because primitive entities are an additive entity variant
  and existing schema-v1 projects remain valid.

## Consequences

The model has explicit SI-valued geometry suitable for deterministic rendering
and later numerical work. Additional primitive geometry variants can extend the
geometry discriminated union. If user-facing rotation conventions change, they
must be converted at the UI boundary without silently changing stored meaning.
