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

When saving or comparing results, keep the command, commit, environment metadata,
solver version, workload counts, timing/throughput, memory estimates, and
CPU-versus-GPU disagreement counts together. Do not use measurements from a
single device to set automatic quality defaults.
