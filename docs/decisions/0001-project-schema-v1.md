# Project schema version 1

## Status

Accepted for Milestone 3.

## Decision

The authoritative project is a plain, versioned TypeScript object containing
project metadata, coordinate alignment, and ID-addressed domain entities. Version
1 supports the parcel entity already present in the application. Its geometry is
stored in east/north meters and remains independent of Three.js and React.

Project changes pass through immutable commands and a small subscribable store.
The Three.js scene reconciles disposable views by entity ID from each project
snapshot. JSON serialization preserves this domain object directly.

Full external-file validation, migrations, save/load UI, and additional entity
kinds remain deferred to their roadmap milestones.
