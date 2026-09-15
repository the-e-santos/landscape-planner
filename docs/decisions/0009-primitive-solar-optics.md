# 0009: Primitive solar optics are independent of appearance

## Status

Accepted during Milestone 5.

## Context

Primitive objects, especially canopies and screens, need user-controlled solar
transmission before the Milestone 7 visibility solver is implemented. Three.js
material opacity is a display choice and cannot be used as a physical input.

## Decision

- Give primitive entities an optional solar-optics component with `ignored`,
  `opaque`, and `transmissive` modes.
- Store constant transmittance as a fraction from zero through one and display it
  as a percentage in the inspector.
- Treat missing solar optics on early schema-v1 primitives as opaque, preserving
  compatibility without a schema-version change.
- Default newly created canopies to an explicit, illustrative 50% transmittance.
  Default other new primitives to opaque. Users can change either choice.
- Show the non-transmitted fraction as a derived value. Do not label it physical
  absorbance because the initial model does not separately account for reflection
  or scattering.
- Keep visual material opacity independent from solar optics.

## Consequences

Projects can express the inputs needed by the later constant-transmission ray
solver without depending on rendered materials. The initial scalar model does not
vary with wavelength, season, path length, incidence angle, or canopy density;
future models will require an explicit schema evolution rather than silently
changing this field's meaning.
