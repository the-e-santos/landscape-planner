# Solar analysis guide

## Purpose and scope

Landscape Planner estimates broadband solar irradiance and accumulated radiant
exposure on sampled terrain and primitive surfaces. It preserves direct sunlight
and diffuse skylight as separate channels, applies project geometry and solar
transmission, and reports their sum.

The current climate is intentionally synthetic. It is useful for comparing
locations, orientations, obstructions, design alternatives, and seasons. It is
not a substitute for measured weather, EPW/TMY data, photosynthetically active
radiation (PAR), or plant-specific Daily Light Integral (DLI).

## Quantities and units

| Quantity | Unit | Meaning |
| --- | --- | --- |
| DNI | W/m² | Direct-normal irradiance: solar-beam power on a plane perpendicular to the sun |
| DHI | W/m² | Diffuse-horizontal irradiance: sky-scattered power on an unobstructed horizontal plane |
| Instant direct | W/m² | DNI projected onto the sampled surface and reduced by path transmission |
| Instant diffuse | W/m² | Irradiance integrated from visible diffuse-sky patches |
| Accumulated direct | kWh/m² | Direct irradiance integrated over the selected period |
| Accumulated diffuse | kWh/m² | Diffuse irradiance integrated over the selected period |
| Total | W/m² or kWh/m² | Direct plus diffuse in the corresponding instantaneous or accumulated unit |

For a horizontal unobstructed surface, the fundamental closure relation is:

```text
GHI = DHI + DNI × cos(solar zenith)
```

The solver generalizes the direct term to any surface orientation:

```text
direct = DNI × max(0, surface normal · sun direction) × path transmission
```

The incidence cosine is applied exactly once. It is separate from atmospheric
attenuation of DNI.

## Synthetic climate inputs

The panel exposes two reference sky states. Accumulated analysis blends them at
each time sample using the editable overcast-probability curve.

| Input | Default | Useful synthetic range | Interpretation |
| --- | ---: | ---: | --- |
| Clear high-sun DNI | 850 W/m² | 700–950 | Typical values progress from hazy to very clear |
| Clear reference DHI | 120 W/m² | 50–160 | Diffuse sky under clear or mildly hazy conditions |
| Overcast high-sun DNI | 0 W/m² | 0–100 | Zero for uniform overcast; nonzero for thin or broken cloud |
| Overcast reference DHI | 250 W/m² | 100–400 | Typical through bright overcast diffuse conditions |

These are reference values rather than predictions for a particular address.
The defaults provide a neutral comparison scenario. Actual values vary with
solar elevation, aerosols, humidity, elevation, cloud thickness, and location.

## Direct irradiance through the day

Configured DNI is interpreted at relative optical air mass one. The implementation
uses the Kasten–Young 1989 approximation:

```text
m = 1 / (cos(z) + 0.50572 × (96.07995 - z)^-1.6364)
```

where `z` is solar zenith in degrees. A small annual Earth–Sun distance correction
produces extraterrestrial normal irradiance `I0`. The model derives optical depth
from the configured reference and evaluates:

```text
tau = -ln(reference DNI / I0)
DNI(t) = I0 × exp(-tau × air mass(t))
```

This reduces direct-normal irradiance near the horizon without multiplying by
the surface-incidence cosine a second time. The model currently assumes sea-level
pressure and does not apply refraction or site-elevation corrections.

## Diffuse irradiance and sky distribution

Configured DHI is a reference for an overhead sun. Its daily envelope is:

```text
DHI(t) = reference DHI × max(0, sin(solar altitude))
```

The resulting DHI is distributed anisotropically over 145 Tregenza sky patches.
Clear skies include simple circumsolar and horizon brightening; overcast skies
use a zenith-brightening distribution. Every instantaneous distribution is
normalized so an unobstructed horizontal surface numerically reproduces DHI.

The direct solar disk remains separate from the diffuse sky.

## Accumulation and cloud probability

The morning, noon, and evening controls define a piecewise-linear probability
curve over apparent local solar time. Each temporal sample uses the deterministic
expected value:

```text
expected irradiance = (1 - p) × clear + p × overcast
```

This is modeled climatology, not a randomly generated weather sequence. Direct
sun directions are clustered for repeated visibility work. Diffuse patch
radiance is integrated over time before surface visibility is evaluated.

## Exposure interpretation

### Daily average

Accumulated direct, diffuse, and total kWh/m² are divided by the inclusive number
of selected calendar days.

### Equivalent peak-sun energy

One equivalent peak-sun hour means 1 kWh/m² of total broadband energy, equivalent
to one hour at a reference irradiance of 1 kW/m². It is an energy convention, not
literal direct-sun duration.

### Energy bands

The current comparative bands are:

| Equivalent peak-sun energy | Label |
| ---: | --- |
| Below 2 h/day | Deep-shade energy |
| 2 to below 4 h/day | Partial-shade energy |
| 4 to below 6 h/day | Partial-sun energy |
| 6 h/day or more | Full-sun energy |

These labels are application conventions for broad comparisons. They are not
universal plant requirements and should not be read as literal direct-sun hours.

### Potential direct-sun duration

Potential direct-sun hours count temporal samples when:

- the sun is above the horizon;
- the sampled surface faces the solar disk; and
- project geometry leaves nonzero direct-beam transmission.

The result is independent of synthetic cloud probability. An hour through a
partially transmissive screen still counts as one potential hour.

### Transmission-weighted direct-sun duration

Transmission-weighted duration accumulates `transmission × time`. One hour under
a 50% screen therefore contributes 0.5 weighted hour. An opaque obstruction
contributes zero to both duration measures.

### Comparison with unobstructed exposure

The panel compares the sampled surface with the same position, orientation, and
climate after removing primitive occluders. It is not a comparison with a
horizontal surface or extraterrestrial radiation.

## Heatmaps and probes

- **Direct:** solar-disk channel only.
- **Diffuse sky:** integrated visibility of the 145 sky patches.
- **Total:** direct plus diffuse.
- **Point probe:** evaluates the selected rendered point and its actual surface
  normal. Accumulated probes also report daily averages, energy interpretation,
  unobstructed comparison, and direct-sun duration.

Lower sample spacing creates denser surface sampling. More direct directions
reduce accumulated directional-clustering error. Both increase calculation time.

## Current limitations

- Synthetic rather than location-specific weather inputs.
- Sea-level relative air mass without pressure/elevation correction.
- No ground-reflected or nearby-object-reflected radiation.
- No spectral PAR, PPFD, or DLI calculation.
- No civil-time conversion; controls use apparent local solar time.
- Constant per-object solar transmittance rather than path-length-dependent foliage.
- Terrain does not yet act as a ray occluder in the primitive visibility solver.

## Technical references

- [NREL solar-radiation measurement best practices](https://www.nrel.gov/docs/fy24osti/88300.pdf)
- [Sandia PVPMC: Direct Normal Irradiance](https://pvpmc.sandia.gov/modeling-guide/1-weather-design-inputs/irradiance-insolation/direct-normal-irradiance/)
- [Sandia PVPMC: Diffuse Horizontal Irradiance](https://pvpmc.sandia.gov/modeling-guide/1-weather-design-inputs/irradiance-insolation/diffuse-horizontal-irradiance/)
- [pvlib: Kasten–Young relative air mass](https://pvlib-python.readthedocs.io/en/stable/_modules/pvlib/atmosphere.html)
- [Radiance `gendaylit` sky-model documentation](https://www.radiance-online.org/learning/documentation/manual-pages/pdfs/gendaylit.pdf)

Implementation decisions are recorded in
[ADR 0014](decisions/0014-tregenza-synthetic-diffuse-sky.md),
[ADR 0015](decisions/0015-horticultural-exposure-interpretation.md), and
[ADR 0016](decisions/0016-synthetic-daily-irradiance-and-sun-duration.md).
