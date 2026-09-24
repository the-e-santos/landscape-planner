# 0019: User-authored group interaction catalog

## Status

Accepted during Milestone 11.

## Context

Bundling plant-interaction claims would make the application responsible for
maintaining and endorsing horticultural guidance. Taxonomy-pair rules would also
require a large curated database before the feature became useful. Users need a
way to express the classifications and evidence they trust without the program
inferring botanical claims.

## Decision

- Project schema version 3 contains a project-scoped interaction catalog with
  user-defined groups and rules. New projects start with an empty catalog.
- Each plant stores an explicit, unique list of zero or more interaction-group
  IDs. Taxonomy remains identification metadata and does not assign groups.
- Rules select source and target groups. Spatial applicability remains a separate
  domain: foliage proximity, shared planting-bed soil, or shared irrigation.
- Rules retain direction, effect, polarity, strength, confidence, provenance,
  notes, and optional conditions.
- Provenance can be a publication, extension guidance, web resource, personal
  observation, local knowledge, or another user-described source.
- Findings are labeled as results of user-authored rules. The application ships
  no horticultural claims.
- Groups cannot be removed while plants or rules reference them. Duplicate and
  missing memberships are rejected by commands and deserialization.

## Consequences

Projects remain portable and reproduce their guidance without a global database.
A plant may participate in several independent classifications or none at all.
Users carry responsibility for the claims they enter, while the application
provides validation, explicit provenance, relationship matching, and transparent
explanations.

Schema version 2 projects migrate with an empty catalog and empty group membership
for every plant. Catalog import/export and shared reusable libraries may be added
later without changing the rule semantics.
