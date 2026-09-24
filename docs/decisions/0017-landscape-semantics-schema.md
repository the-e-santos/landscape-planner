# 0017: Explicit landscape relationship domains

## Status

Accepted during Milestone 11.

## Context

Plant proximity, shared soil, and shared irrigation can overlap spatially, but
they do not mean the same thing. Inferring membership from drawn geometry would
make plant guidance unstable when a footprint is edited and could silently claim
relationships that the user never specified. These entities also need to remain
serializable domain data rather than Three.js scene objects.

## Decision

- Project schema version 2 adds planting-bed, irrigation-zone, and plant entities.
- Planting beds have a world-space east/north footprint and soil metadata. The
  soil metadata includes its visible surface cover (such as bare soil, mulch,
  turf, gravel, concrete, or pavers), from which the view may derive appearance.
- Irrigation zones may have a footprint for display and organization, but a plant's
  irrigation memberships are an explicit list of zone IDs.
- A plant has a stable taxonomy identifier plus a display/scientific name, a
  world-space position, and a simplified spherical canopy radius.
- Shared soil is represented by explicit planting-bed membership on the plant.
  Shared irrigation is represented independently and may include multiple zones.
- Foliage proximity is calculated from canopy extents and does not imply either
  shared soil or shared irrigation.
- Commands and project deserialization reject dangling bed or irrigation
  references. Historical migration support was later removed before release.

## Consequences

Relationship queries are deterministic and do not change merely because visual
footprints overlap. The canopy radius is only a transparent first approximation
for foliage distance; it is not root geometry or a growth model. Editing and
rendering for these entities, and the evidence-aware interaction-rule evaluator,
remain separate Milestone 11 increments.

Surface cover intentionally lives with soil metadata for a compact editing model.
The scene view maps its values to a restrained color palette and drapes bed and
irrigation footprints over the derived terrain. At a retaining-wall boundary, the
upper terrain surface is used. These are view projections: surface cover does not
determine solar transmissivity or store Three.js material settings.
