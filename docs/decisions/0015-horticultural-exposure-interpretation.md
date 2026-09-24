# 0015: Horticultural labels use broadband energy equivalents

## Status

Accepted during Milestone 10.

## Context

Accumulated direct and diffuse exposure in kWh/m² is quantitative but awkward to
compare with familiar horticultural descriptions. Terms such as full sun and
partial shade are often stated as hours of direct sun, while this solver measures
broadband radiant energy and preserves diffuse skylight. Converting broadband
energy directly to photosynthetically active radiation or daily light integral
would imply spectral information the model does not contain.

## Decision

- Report average daily direct, diffuse, and total broadband exposure over the
  inclusive selected date range.
- Define an equivalent peak-sun hour as 1 kWh/m² of total daily broadband radiant
  exposure, corresponding to one hour at a reference irradiance of 1 kW/m².
- Use explicitly energy-qualified comparison bands:
  - below 2 equivalent hours/day: deep-shade energy
  - 2 to below 4: partial-shade energy
  - 4 to below 6: partial-sun energy
  - 6 or more: full-sun energy
- Report direct and diffuse shares separately.
- Compare the sampled surface with the same position and orientation after
  removing primitive occluders. This is an exposure-retention comparison, not a
  comparison with a horizontal surface or extraterrestrial radiation.
- Label the result as broadband energy guidance. Do not call equivalent hours
  literal direct-sun duration, PAR, or DLI.

## Consequences

Users receive compact terms for comparing locations while retaining the physical
quantities behind them. The thresholds are transparent application conventions,
not universal plant requirements. A later spectral or plant-requirement model may
add PAR/DLI or taxon-specific guidance without changing these stored irradiance
results.
