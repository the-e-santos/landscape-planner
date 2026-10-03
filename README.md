# Landscape Planner

Landscape Planner is a browser-based, local-first residential landscape planning
application. It combines an interactive Three.js yard model with quantitative
direct and diffuse solar-exposure analysis, explicit geometric uncertainty, and
eventual evidence-aware planting guidance.

The project is a hobby/open-source prototype focused on transparent calculations,
testable numerical kernels, and an understandable architecture.

## Run locally

Requirements:

- Node.js and npm
- A current browser. WebGPU is preferred, but it is not required: Three.js can
  render through its WebGL 2 fallback, and solar analysis retains a CPU backend.

From PowerShell:

```powershell
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:5173](http://localhost:5173). Press `Ctrl+C` in the terminal
to stop the development server.

## Verification

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

## Documentation

- [Foundational project plan](docs/PROJECT_PLAN.md)
- [Solar analysis guide](docs/SOLAR_ANALYSIS.md)
- [Coordinate and unit conventions](docs/COORDINATES.md)
- [Architecture decisions](docs/decisions/)

The solar guide explains DNI, DHI, the synthetic climate parameters, direct and
diffuse accumulation, heatmaps, equivalent peak-sun energy, direct-sun duration,
horticultural interpretation, and current limitations.

## Current status

Milestones 1–11 are complete. Milestone 12 WebGPU acceleration is in progress,
beginning with a GPU-ready scene/BVH format and capability-aware CPU fallback.

See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for the ordered roadmap and
deferred scope.
