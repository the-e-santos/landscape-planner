import type { EntityId } from './project'

export interface Position3 {
  readonly eastMeters: number
  readonly elevationMeters: number
  readonly northMeters: number
}

export interface Rotation3 {
  readonly xRadians: number
  readonly yRadians: number
  readonly zRadians: number
}

export interface ObjectTransform {
  /** Position of the primitive's local center in the project coordinate frame. */
  readonly position: Position3
  /** Intrinsic XYZ Euler rotation, stored in radians. */
  readonly rotation: Rotation3
}

export interface BoxGeometry {
  readonly kind: 'box'
  readonly widthMeters: number
  readonly heightMeters: number
  readonly depthMeters: number
}

export interface PrimitiveEntity {
  readonly id: EntityId
  readonly kind: 'primitive'
  readonly name: string
  readonly transform: ObjectTransform
  readonly geometry: BoxGeometry
}

export const DEFAULT_HOUSE_ID = 'primitive.house'

export function createDefaultHouseEntity(): PrimitiveEntity {
  return {
    id: DEFAULT_HOUSE_ID,
    kind: 'primitive',
    name: 'House massing',
    transform: {
      position: {
        eastMeters: -4,
        elevationMeters: 2.2,
        northMeters: 0,
      },
      rotation: {
        xRadians: 0,
        yRadians: 0,
        zRadians: 0,
      },
    },
    geometry: {
      kind: 'box',
      widthMeters: 6,
      heightMeters: 3,
      depthMeters: 8,
    },
  }
}

export function clonePrimitiveEntity(
  entity: PrimitiveEntity,
): PrimitiveEntity {
  return {
    ...entity,
    transform: {
      position: { ...entity.transform.position },
      rotation: { ...entity.transform.rotation },
    },
    geometry: { ...entity.geometry },
  }
}

export function validatePrimitiveEntity(entity: PrimitiveEntity): void {
  const finiteValues = [
    entity.transform.position.eastMeters,
    entity.transform.position.elevationMeters,
    entity.transform.position.northMeters,
    entity.transform.rotation.xRadians,
    entity.transform.rotation.yRadians,
    entity.transform.rotation.zRadians,
    entity.geometry.widthMeters,
    entity.geometry.heightMeters,
    entity.geometry.depthMeters,
  ]

  if (finiteValues.some((value) => !Number.isFinite(value))) {
    throw new Error('Primitive transform and dimensions must be finite numbers')
  }

  if (
    entity.geometry.widthMeters <= 0 ||
    entity.geometry.heightMeters <= 0 ||
    entity.geometry.depthMeters <= 0
  ) {
    throw new Error('Primitive dimensions must be greater than zero')
  }
}
