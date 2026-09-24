import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import type {
  IrrigationZoneEntity,
  PlantEntity,
  PlantingBedEntity,
  SurfaceCover,
} from '../domain/landscape'
import {
  createIrrigationZoneView,
  createPlantingBedView,
  createPlantView,
  getSurfaceCoverColor,
} from './createLandscapeView'

const bed: PlantingBedEntity = {
  id: 'bed.view-test',
  kind: 'plantingBed',
  name: 'View test bed',
  footprint: [
    { eastMeters: 0, northMeters: 0 },
    { eastMeters: 2, northMeters: 0 },
    { eastMeters: 2, northMeters: 1 },
    { eastMeters: 0, northMeters: 1 },
  ],
  soil: {
    texture: 'loam',
    drainage: 'wellDrained',
    surfaceCover: 'mulch',
    usableRootDepthMeters: 0.5,
  },
}

describe('landscape scene views', () => {
  it('maps every surface cover to a distinct visible color', () => {
    const covers: readonly SurfaceCover[] = [
      'bareSoil',
      'mulch',
      'turf',
      'groundcover',
      'gravel',
      'concrete',
      'pavers',
      'other',
    ]

    expect(new Set(covers.map(getSurfaceCoverColor)).size).toBe(covers.length)
    expect(getSurfaceCoverColor('concrete')).not.toBe(
      getSurfaceCoverColor('bareSoil'),
    )
  })

  it('drapes a bed over sampled terrain and updates its cover color', () => {
    const view = createPlantingBedView(
      bed,
      (eastMeters, northMeters) => eastMeters + northMeters,
    )
    const surface = view.object.getObjectByName(
      `planting-bed-surface:${bed.id}`,
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    const positions = surface.geometry.getAttribute('position')

    for (let index = 0; index < positions.count; index += 1) {
      expect(positions.getY(index)).toBeCloseTo(
        positions.getX(index) - positions.getZ(index) + 0.035,
      )
    }
    expect(surface.material.color.getHex()).toBe(getSurfaceCoverColor('mulch'))

    view.update({
      ...bed,
      soil: { ...bed.soil, surfaceCover: 'concrete' },
    })
    const updated = view.object.getObjectByName(
      `planting-bed-surface:${bed.id}`,
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    expect(updated.material.color.getHex()).toBe(
      getSurfaceCoverColor('concrete'),
    )
    view.dispose()
  })

  it('renders irrigation geometry only when a footprint is present', () => {
    const zone: IrrigationZoneEntity = {
      id: 'irrigation.view-test',
      kind: 'irrigationZone',
      name: 'View test zone',
      deliveryMethod: 'drip',
    }
    const view = createIrrigationZoneView(zone)
    expect(view.object.children).toHaveLength(0)

    view.update({ ...zone, footprint: bed.footprint })
    expect(view.object.getObjectByName(
      `irrigation-zone-fill:${zone.id}`,
    )).toBeInstanceOf(THREE.Mesh)
    expect(view.object.getObjectByName(
      `irrigation-zone-outline:${zone.id}`,
    )).toBeInstanceOf(THREE.LineLoop)
    view.dispose()
  })

  it('projects plant canopy extent and position from domain state', () => {
    const plant: PlantEntity = {
      id: 'plant.view-test',
      kind: 'plant',
      name: 'View test plant',
      taxonId: 'taxon:view-test',
      scientificName: 'Planta testii',
      position: { eastMeters: 2, elevationMeters: 1.5, northMeters: 3 },
      canopyRadiusMeters: 0.75,
      irrigationZoneIds: [],
    }
    const view = createPlantView(plant)

    expect(view.object.position.toArray()).toEqual([2, 1.5, -3])
    const canopy = view.object.getObjectByName(
      `plant-canopy:${plant.id}`,
    ) as THREE.Mesh<THREE.SphereGeometry>
    canopy.geometry.computeBoundingSphere()
    expect(canopy.geometry.boundingSphere?.radius).toBeCloseTo(0.75)
    view.dispose()
  })
})
