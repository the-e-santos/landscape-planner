# 0021: WebGPU solar acceleration is optional

## Status

Accepted during Milestone 12.

## Context

Milestone 12 adds a WebGPU compute path for batched solar visibility. Users may
run the application where WebGPU is unavailable, disabled by browser policy,
denied during adapter acquisition, or lost while the application is running.
Quantitative solar analysis must remain usable in those environments.

The existing CPU visibility solver is deterministic, independently testable, and
the correctness reference for accelerated implementations.

## Decision

- Keep the CPU solver as a supported execution backend, not only a test oracle.
- Treat WebGPU as optional acceleration. `auto` mode selects it only after an
  adapter is successfully acquired.
- Fall back to CPU when WebGPU capability detection, initialization, or execution
  fails. A later UI status should show the active backend and fallback reason
  without preventing analysis.
- Preserve the renderer's independent WebGL 2 fallback. Rendering capability and
  solar-compute capability are detected separately.
- Pack solar occluders into versioned typed-array buffers with an iterative BVH
  layout suitable for both CPU inspection and GPU storage buffers.
- Continue comparing accelerated results with the CPU reference using
  deterministic and seeded-random differential fixtures.

## Consequences

Every solar-analysis feature must remain correct on CPU, although large refined
analyses may take longer. GPU-specific code cannot become the only implementation
of a physical calculation. The initial packed scene and backend-selection policy
do not yet execute a compute shader; they establish the boundary for the batched
kernel and its fallback behavior.
