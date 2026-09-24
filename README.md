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
- A current browser with WebGPU support for the preferred rendering path

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

Milestones 1–9 are complete. Milestone 10 currently includes the 145-patch
Tregenza diffuse sky, normalized synthetic clear/overcast climate states,
time-varying DNI/DHI, accumulated direct and diffuse exposure, surface heatmaps,
quantitative probes, and horticultural comparison metrics.

See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for the ordered roadmap and
deferred scope.
