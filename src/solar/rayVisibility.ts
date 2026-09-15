import {
  getPrimitiveSolarOptics,
  type PrimitiveEntity,
  type Rotation3,
} from '../domain/primitive'

export interface Vector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Ray {
  readonly origin: Vector3
  readonly direction: Vector3
}

export interface OpticalCrossing {
  readonly entityId: string
  readonly distanceMeters: number
  readonly transmittance: number
}

export interface RayTransmissionResult {
  readonly transmission: number
  readonly crossings: readonly OpticalCrossing[]
  readonly blockedByEntityId?: string
}

const RAY_EPSILON_METERS = 1e-6

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }
}

function inverseRotate(vector: Vector3, rotation: Rotation3): Vector3 {
  const a = Math.cos(rotation.xRadians)
  const b = Math.sin(rotation.xRadians)
  const c = Math.cos(rotation.yRadians)
  const d = Math.sin(rotation.yRadians)
  const e = Math.cos(rotation.zRadians)
  const f = Math.sin(rotation.zRadians)

  // Transpose of Three.js's intrinsic XYZ Euler rotation matrix.
  return {
    x: c * e * vector.x + (a * f + b * e * d) * vector.y +
      (b * f - a * e * d) * vector.z,
    y: -c * f * vector.x + (a * e - b * f * d) * vector.y +
      (b * e + a * f * d) * vector.z,
    z: d * vector.x - b * c * vector.y + a * c * vector.z,
  }
}

function toLocalRay(ray: Ray, entity: PrimitiveEntity): Ray {
  const center = {
    x: entity.transform.position.eastMeters,
    y: entity.transform.position.elevationMeters,
    z: -entity.transform.position.northMeters,
  }
  return {
    origin: inverseRotate(subtract(ray.origin, center), entity.transform.rotation),
    direction: inverseRotate(ray.direction, entity.transform.rotation),
  }
}

function intersectAxisAlignedBox(
  ray: Ray,
  halfExtents: Vector3,
): number | undefined {
  let near = Number.NEGATIVE_INFINITY
  let far = Number.POSITIVE_INFINITY
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = ray.origin[axis]
    const direction = ray.direction[axis]
    const extent = halfExtents[axis]
    if (Math.abs(direction) < Number.EPSILON) {
      if (origin < -extent || origin > extent) return undefined
      continue
    }
    const first = (-extent - origin) / direction
    const second = (extent - origin) / direction
    near = Math.max(near, Math.min(first, second))
    far = Math.min(far, Math.max(first, second))
    if (near > far) return undefined
  }
  const distance = near > RAY_EPSILON_METERS ? near : far
  return distance > RAY_EPSILON_METERS ? distance : undefined
}

function intersectEllipticalCylinder(
  ray: Ray,
  radiusX: number,
  radiusZ: number,
  halfHeight: number,
): number | undefined {
  const candidates: number[] = []
  const a = ray.direction.x ** 2 / radiusX ** 2 +
    ray.direction.z ** 2 / radiusZ ** 2
  const b = 2 * (
    ray.origin.x * ray.direction.x / radiusX ** 2 +
    ray.origin.z * ray.direction.z / radiusZ ** 2
  )
  const c = ray.origin.x ** 2 / radiusX ** 2 +
    ray.origin.z ** 2 / radiusZ ** 2 - 1
  const discriminant = b * b - 4 * a * c
  if (a > Number.EPSILON && discriminant >= 0) {
    const root = Math.sqrt(discriminant)
    for (const distance of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      const y = ray.origin.y + distance * ray.direction.y
      if (distance > RAY_EPSILON_METERS && Math.abs(y) <= halfHeight) {
        candidates.push(distance)
      }
    }
  }
  if (Math.abs(ray.direction.y) > Number.EPSILON) {
    for (const y of [-halfHeight, halfHeight]) {
      const distance = (y - ray.origin.y) / ray.direction.y
      const x = ray.origin.x + distance * ray.direction.x
      const z = ray.origin.z + distance * ray.direction.z
      if (
        distance > RAY_EPSILON_METERS &&
        x ** 2 / radiusX ** 2 + z ** 2 / radiusZ ** 2 <= 1
      ) {
        candidates.push(distance)
      }
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined
}

function intersectEllipsoid(
  ray: Ray,
  radii: Vector3,
): number | undefined {
  const a = ray.direction.x ** 2 / radii.x ** 2 +
    ray.direction.y ** 2 / radii.y ** 2 +
    ray.direction.z ** 2 / radii.z ** 2
  const b = 2 * (
    ray.origin.x * ray.direction.x / radii.x ** 2 +
    ray.origin.y * ray.direction.y / radii.y ** 2 +
    ray.origin.z * ray.direction.z / radii.z ** 2
  )
  const c = ray.origin.x ** 2 / radii.x ** 2 +
    ray.origin.y ** 2 / radii.y ** 2 +
    ray.origin.z ** 2 / radii.z ** 2 - 1
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return undefined
  const root = Math.sqrt(discriminant)
  const distances = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((distance) => distance > RAY_EPSILON_METERS)
  return distances.length > 0 ? Math.min(...distances) : undefined
}

interface Point2 { readonly x: number; readonly z: number }

function pointInPolygon(point: Point2, polygon: readonly Point2[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]
    const b = polygon[previous]
    if (
      (a.z > point.z) !== (b.z > point.z) &&
      point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function intersectPolygonExtrusion(
  ray: Ray,
  footprint: readonly { readonly eastMeters: number; readonly northMeters: number }[],
  halfHeight: number,
): number | undefined {
  const polygon = footprint.map((point) => ({
    x: point.eastMeters,
    z: -point.northMeters,
  }))
  const candidates: number[] = []
  if (Math.abs(ray.direction.y) > Number.EPSILON) {
    for (const y of [-halfHeight, halfHeight]) {
      const distance = (y - ray.origin.y) / ray.direction.y
      if (
        distance > RAY_EPSILON_METERS &&
        pointInPolygon({
          x: ray.origin.x + distance * ray.direction.x,
          z: ray.origin.z + distance * ray.direction.z,
        }, polygon)
      ) {
        candidates.push(distance)
      }
    }
  }
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const edgeX = end.x - start.x
    const edgeZ = end.z - start.z
    const determinant = ray.direction.x * edgeZ - ray.direction.z * edgeX
    if (Math.abs(determinant) < Number.EPSILON) continue
    const offsetX = start.x - ray.origin.x
    const offsetZ = start.z - ray.origin.z
    const distance = (offsetX * edgeZ - offsetZ * edgeX) / determinant
    const edgeParameter = (
      offsetX * ray.direction.z - offsetZ * ray.direction.x
    ) / determinant
    const y = ray.origin.y + distance * ray.direction.y
    if (
      distance > RAY_EPSILON_METERS &&
      edgeParameter >= 0 && edgeParameter <= 1 &&
      Math.abs(y) <= halfHeight
    ) {
      candidates.push(distance)
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined
}

export function intersectPrimitive(
  ray: Ray,
  entity: PrimitiveEntity,
): number | undefined {
  const localRay = toLocalRay(ray, entity)
  const geometry = entity.geometry
  switch (geometry.kind) {
    case 'box':
      return intersectAxisAlignedBox(localRay, {
        x: geometry.widthMeters / 2,
        y: geometry.heightMeters / 2,
        z: geometry.depthMeters / 2,
      })
    case 'wall':
      return intersectAxisAlignedBox(localRay, {
        x: geometry.lengthMeters / 2,
        y: geometry.heightMeters / 2,
        z: geometry.thicknessMeters / 2,
      })
    case 'cylinder':
      return intersectEllipticalCylinder(
        localRay,
        geometry.radiusMeters,
        geometry.radiusMeters,
        geometry.heightMeters / 2,
      )
    case 'canopy':
      return intersectEllipsoid(localRay, {
        x: geometry.eastRadiusMeters,
        y: geometry.verticalRadiusMeters,
        z: geometry.northRadiusMeters,
      })
    case 'polygonExtrusion':
      return intersectPolygonExtrusion(
        localRay,
        geometry.footprint,
        geometry.heightMeters / 2,
      )
  }
}

export function tracePrimitiveTransmission(
  ray: Ray,
  primitives: readonly PrimitiveEntity[],
  excludedEntityId?: string,
): RayTransmissionResult {
  const intersections = primitives
    .filter((entity) => entity.id !== excludedEntityId)
    .flatMap((entity) => {
      const optics = getPrimitiveSolarOptics(entity)
      if (optics.mode === 'ignored') return []
      const distanceMeters = intersectPrimitive(ray, entity)
      return distanceMeters === undefined
        ? []
        : [{ entity, optics, distanceMeters }]
    })
    .sort((left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.entity.id.localeCompare(right.entity.id),
    )

  let transmission = 1
  const crossings: OpticalCrossing[] = []
  for (const intersection of intersections) {
    const transmittance = intersection.optics.mode === 'opaque'
      ? 0
      : intersection.optics.transmittance
    crossings.push({
      entityId: intersection.entity.id,
      distanceMeters: intersection.distanceMeters,
      transmittance,
    })
    transmission *= transmittance
    if (transmission === 0) {
      return {
        transmission,
        crossings,
        blockedByEntityId: intersection.entity.id,
      }
    }
  }
  return { transmission, crossings }
}
