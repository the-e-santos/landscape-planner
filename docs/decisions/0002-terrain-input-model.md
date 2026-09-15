# Terrain input model

## Status

Accepted for Milestone 4A.

## Decision

Terrain begins as a collection of authoritative, ID-addressed spot elevations.
Each point stores local east, north, and elevation coordinates; measurement
source; and separate horizontal and vertical uncertainty. Derived triangulation
will not be persisted as project state.

Spot elevations are composed into a terrain entity rather than represented as
Three.js objects or a terrain class hierarchy. Commands add, replace, and remove
points by stable ID. Pure validation reports invalid numbers, uncertainty,
identity conflicts, coincident positions, and input sets that cannot define a
surface.

The terrain entity is an additive extension to schema version 1. Existing version
1 projects containing only parcel entities remain valid, so this does not require
a migration or schema-version increment. Full external JSON validation and
migration infrastructure remain deferred to Milestone 6.
