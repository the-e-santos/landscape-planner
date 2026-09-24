# 0020: Separate interaction catalog document

## Status

Accepted after Milestone 11.

## Context

Interaction groups and rules are reusable knowledge, while plant instances,
positions, and group assignments belong to a particular site layout. Embedding the
catalog in every site duplicated the same user-maintained relationships and made
changes difficult to share across layouts.

## Decision

- Site project schema version 4 stores only an optional stable
  `interactionCatalogId` and each plant's zero-to-many group memberships.
- A separately versioned interaction-catalog document owns its ID, name, groups,
  rules, and provenance. Catalog schema version 1 is independent of site schema.
- Catalogs have independent JSON download/upload and are autosaved in a separate
  IndexedDB database keyed by catalog ID.
- Loading or creating a catalog attaches its ID to the open site. Detaching a
  catalog retains every plant membership.
- A site remains valid when its referenced catalog is unavailable or a membership
  names a group absent from the loaded catalog. The UI reports unresolved
  references and pauses affected guidance rather than rejecting the site file.
- Catalog-internal references remain strict: a rule must reference existing groups,
  and a group used by a rule cannot be deleted.
- Evaluation receives the site and resolved catalog explicitly. No catalog content
  is serialized into site JSON.

## Consequences

One catalog can support multiple independently saved layouts. Sharing a complete
setup requires both the site JSON and catalog JSON, though either document remains
independently loadable. Removing a group can leave unresolved memberships in
other, unopened sites; this is surfaced when those sites and the catalog are next
combined.

There is no schema-3 migration because historical compatibility is not currently
retained. A future bundle format may package a site and catalog together without
changing either authoritative document.
