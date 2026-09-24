# 0018: Evidence-aware plant interaction rules

## Status

Superseded in part by decision 0019. Evidence and explanation requirements remain
accepted; taxonomy-pair selection was replaced by explicit interaction groups.

## Context

Plant guidance can easily present folklore with the same apparent authority as a
well-supported horticultural claim. A relationship also applies through a
specific domain: proximity does not establish shared soil, and overlapping
geometry does not establish shared irrigation.

## Decision

- Plant interactions are standalone data records keyed by stable taxonomy IDs,
  rather than properties embedded in plant entities.
- Every rule declares direction, effect type, polarity, relationship domain,
  strength, confidence, and at least one identifiable evidence source.
- The initial evaluator supports domains the project can determine explicitly:
  foliage proximity, shared planting-bed soil, and shared irrigation zones.
- Findings are classified as recommendations, warnings, or notices according to
  rule polarity. Each finding carries confidence, citations, optional conditions
  and notes, plus a plain-language explanation of why the domain matched.
- Symmetric rules produce one finding per plant pair. Directed rules preserve
  source-to-target orientation.
- Rule and citation IDs must be unique within their relevant collections.

## Consequences

The application can explain both why guidance appeared and what evidence supports
it. Low-confidence claims remain visibly low-confidence instead of being promoted
to facts. Conditions are retained for presentation rather than silently discarded.

No built-in horticultural claims are included yet. Populating a rule catalog
requires source review and is intentionally separate from implementing the rule
format. Solar-effect relationships also remain deferred until plant geometry and
solar results provide an explicit, testable relationship input.
