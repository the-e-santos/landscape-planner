# 0010: CPU point-solar reference uses analytical domain geometry

## Status

Accepted during Milestone 7.

## Context

The first quantitative solar result needs a validated solar position, direct
surface incidence, and deterministic visibility through the persisted primitive
catalog. The reference implementation must remain understandable and independent
of the later GPU solver and of Three.js's rendering raycaster.

## Decision

- Accept date and apparent local solar time as distinct inputs. Solar noon is
  exactly 12:00; civil time conversion remains deferred because it requires
  longitude and time-zone rules.
- Calculate solar declination with the NOAA/Meeus Julian-century equations. A
  date plus solar time does not identify a civil instant, so declination is
  evaluated at 12:00 UTC on the selected date. This approximation is explicit
  and can be replaced behind the same input boundary when civil-time support is
  introduced.
- Express solar azimuth clockwise from true north and rotate it into the local
  project frame using the persisted `northRotationRadians` value.
- Trace rays analytically against domain boxes, walls, cylinders, polygon
  extrusions, and ellipsoidal canopies. Do not construct Three.js geometry or use
  the rendered scene as solver input.
- Apply constant transmittance once per intersected primitive. Ordered results
  retain entity IDs and distances for diagnosis. `ignored` primitives do not
  participate, and an opaque primitive terminates traversal.
- Use a one-micrometre forward-ray epsilon to avoid immediate self-intersection.
  A caller may also exclude the owning entity by ID.

The solar equations follow NOAA's published calculation details:
<https://gml.noaa.gov/grad/solcalc/calcdetails.html>.

## Consequences

The result is a slow but pure and testable CPU ground truth for small scenes.
It currently includes primitive occluders only. A later Milestone 8 increment
uses it for terrain surface sampling, while terrain-as-occluder visibility,
primitive surface atlases, diffuse radiation, temporal accumulation, and
acceleration remain later work. Constant per-object transmission does not model
path length or apply attenuation separately at entry and exit faces.
