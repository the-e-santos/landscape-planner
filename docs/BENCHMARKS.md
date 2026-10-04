# Visibility benchmarks

Milestone 12 includes deterministic visibility workloads for comparing solver
changes across representative scene shapes and quality tiers. They are an
engineering measurement tool, not a performance guarantee.

Run the opt-in CPU benchmark suite from PowerShell:

```powershell
npm.cmd run benchmark
```

To check the runner quickly without executing every workload:

```powershell
npm.cmd run benchmark -- -t "small-suburban / preview"
```

The six scene fixtures cover a small suburban plan, quarter-acre and one-acre
scales, dense transmissive canopies, many small objects, and a few large objects.
The four quality tiers describe sample spacing and the number of surface samples
and illumination directions. Fixture generation is seeded, so a scenario/tier
pair produces the same packed scene and rays on every run.

The current Vitest suite measures the CPU packed-BVH traversal. Scene generation
and packing happen before the timed callback. Structured measurements record the
solver version, scenario and tier, backend, primitive/BVH/ray counts, packed
buffer sizes, elapsed time, throughput, fallback reason, and optional environment
metadata. The normal unit suite also compares a deterministic subset against the
independent domain-object CPU reference; it does not enforce machine-dependent
timing thresholds.

Each case also prints one `VISIBILITY_BENCHMARK` JSON record containing the
workload metadata, packed buffer sizes, timing summary, runtime environment, and
disagreement for a 256-ray reference subset. This line is suitable for capture
by a benchmark log or later comparison tool.

WebGPU timings require a browser with an available adapter and should identify
the browser, adapter vendor/architecture, operating system, and whether the
adapter is a software fallback. GPU measurements should include upload, dispatch,
and readback unless a report explicitly labels a narrower measurement. A machine
without WebGPU can run the CPU benchmarks and all correctness tests.

## Browser WebGPU validation

Milestone 12F includes a retained real-device validation page. Start the
development server, open the following URL in the WebGPU-enabled browser, and
select **Run validation**:

```text
http://localhost:5173/?webgpu-validation
```

The page runs three deterministic visibility workloads and an accumulated
direct-and-diffuse exposure workload through both the CPU and actual WGSL paths.
It reports transmission, blocker, and exposure-value disagreement and offers a
copyable/downloadable JSON record with adapter and browser metadata.

SwiftShader is valid for this correctness check. Its report identifies it as a
software fallback, so its timings must not be treated as hardware-GPU
performance. Without an adapter, the page reports `SKIPPED`; normal application
use and the CPU solver remain available.

### Recorded Milestone 12 validation

On October 4, 2026, suite `milestone-12f.v1` passed all four cases in Edge 154 on
Windows using Google's SwiftShader fallback adapter. All cases completed on the
WebGPU backend without fallback. Across 17,408 raw visibility rays there were no
transmission or blocker mismatches; the largest transmission difference was
`1.4901161193847656e-8`. The 2,380-ray accumulated case had no direct, diffuse,
or total exposure-value mismatches. This establishes functional CPU/WGSL
agreement for that software adapter, not hardware-GPU performance.

## End-to-end heatmap comparison

Two diagnostic URL overrides make it possible to compare the complete UI path
with identical project and solar settings:

```text
http://localhost:5173/?solar-compute=cpu
http://localhost:5173/?solar-compute=webgpu
```

The override is shown in the Solar panel. The completion message reports the
backend that actually finished each calculation; a WebGPU run that falls back to
CPU is therefore not a WebGPU comparison. Missing, `auto`, and unrecognized
values retain normal capability-aware automatic selection.

For a release smoke test, open both URLs in separate tabs, use the same project,
and wait for refinement to finish before comparing:

1. Instant direct, diffuse, and total heatmaps.
2. Accumulated direct, diffuse, and total heatmaps.
3. Legend ranges and heatmap colors around several probe locations.
4. Recalculation after moving an occluding object.

The heatmaps should be visually indistinguishable. The quantitative probe
readout remains the CPU reference in both tabs, so use it as a common spatial
anchor rather than as another GPU comparison; suite 12F supplies the numerical
CPU/WGSL comparison. On a SwiftShader-only system, use the specially launched
WebGPU-enabled browser for both tabs. These parameters are diagnostics; they are
not persisted in project data or presented as ordinary quality options.

When saving or comparing results, keep the command, commit, environment metadata,
solver version, workload counts, timing/throughput, memory estimates, and
CPU-versus-GPU disagreement counts together. Do not use measurements from a
single device to set automatic quality defaults.
