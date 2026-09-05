# Landscape Planner — Repository Instructions

## Project purpose

This repository contains a browser-based, local-first residential landscape
planning application. It will support interactive 3D yard modeling, quantitative
direct and diffuse solar-exposure analysis, explicit geometric uncertainty, and
evidence-aware planting guidance.

This is a hobby/open-source project intended to remain understandable and
shareable. Favor clarity, testability, and incremental progress over premature
production infrastructure.

## Read before changing code

- Read `docs/PROJECT_PLAN.md` for the architecture, terminology, phased roadmap,
  validation strategy, and deferred scope.
- Inspect the existing code and configuration before proposing or making changes.
- Treat the current repository state and tests as authoritative when they differ
  from examples in the plan; call out meaningful architectural conflicts.

## Current milestone

Milestones 1 and 2 are complete. Build Milestone 3, domain/scene separation:

- minimal versioned project schema
- domain objects independent of Three.js
- view synchronization from domain state
- object IDs and a small command/update API
- round-trip serialization test

Do not begin primitive editing, persistence UI, the quantitative solar solver,
plant database, arbitrary mesh import, or a broad application framework during
this milestone unless explicitly asked.

After that, follow the milestone order in `docs/PROJECT_PLAN.md`.

## Core technology

- TypeScript with strict type checking
- React and Vite for the application shell and interface
- Three.js for 3D rendering and interaction
- `WebGPURenderer` as the preferred rendering path
- WebGPU compute as the intended high-performance simulation path
- Web Workers for substantial CPU work that should not block the interface
- A retained CPU reference solver for correctness testing
- Versioned JSON as the authoritative project format
- IndexedDB or OPFS for later local persistence

Do not add a dependency merely because it may be useful later. Add one when the
current task benefits from it and record the reason if the choice is architectural.

## Architectural rules

### Domain state and rendering

- Do not use `THREE.Object3D`, meshes, materials, or the Three.js scene graph as
  the authoritative project model.
- Keep serializable domain objects separate from their rendered Three.js views.
- Make rendering a projection of domain state.
- Use composition rather than deep inheritance for landscape entities.
- Keep React responsible for interface lifecycle and UI; do not put the
  frame-by-frame render loop or large numerical buffers in React state.

### Coordinates and units

- Use meters internally for length and SI units for physical calculations.
- Use a local Cartesian frame with `+X = east`, `+Y = up`, and `-Z = north`.
- Store scene north orientation explicitly when importing or aligning source data.
- Treat display units such as feet and inches as presentation and input concerns.
- Geometry may have sub-inch precision; calculation and display resolution are
  separate settings.

### Solar model

- Preserve direct-sun and diffuse-sky quantities as separate channels.
- Treat the solar disk as a directional source, not as a diffuse sky patch.
- Represent the diffuse sky as a discretized anisotropic hemisphere.
- Keep climate/irradiance modeling behind an interface; average cloud fraction
  is not itself a complete radiation model.
- Represent exposure on actual surfaces, not in a world-space voxel grid.
- Model solar transmissivity independently from visual material opacity.
- Support opaque, ignored, and partially transmissive solar occluders.
- Pre-integrate time and weather into weighted illumination directions before
  repeated scene-visibility calculations where possible.
- Use progressive and spatially invalidated calculations rather than assuming a
  one-inch full-lot recomputation after every edit.
- Retain an independently understandable CPU implementation after GPU acceleration
  is introduced, and compare CPU/GPU results in automated tests.

### Landscape semantics

- Keep foliage proximity, shared soil, shared irrigation, shading, and other
  relationship domains distinct.
- Define planting beds and irrigation zones explicitly; do not infer them from
  visual overlap alone.
- Model plant interactions as first-class, directional or symmetric rules with
  effect type, applicable domain, strength, confidence, and sources.
- Do not present low-confidence companion-planting folklore as established fact.
- Represent property and object-position uncertainty explicitly rather than
  implying unsupported precision.

## Development approach

- Work in small vertical increments that leave the application runnable.
- Prefer the simplest design that supports the current milestone and the next
  clearly identified one.
- Avoid speculative frameworks, generalized plugin systems, and broad refactors.
- Keep numerical kernels independent of UI code.
- Put pure calculations in testable modules with explicit inputs and outputs.
- Add analytical fixtures before optimizing solar calculations.
- Make quality/performance approximations visible in types, settings, or result
  metadata rather than silently changing the physical meaning of a result.
- Document decisions that change coordinate conventions, persisted schemas,
  physical definitions, or solver behavior.

## Verification

Before considering a code change complete:

1. Run the repository's lint command.
2. Run relevant unit tests.
3. Run the production build/type check.
4. For visible changes, launch the app and inspect the affected interaction when
   the environment permits it.
5. Report checks that were not run and why.

Do not weaken lint, type, or test configuration solely to make a change pass.

## Git and change hygiene

- Preserve unrelated user changes in a dirty worktree.
- Keep commits and diffs focused on the requested increment.
- Do not rewrite history or perform destructive Git operations unless explicitly
  requested.
- Do not commit generated build output, dependencies, secrets, local environment
  files, or large derived simulation data.
