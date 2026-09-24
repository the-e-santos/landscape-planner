import { describe, expect, it } from 'vitest'
import {
  foliageGapMeters,
  getFoliageNeighbors,
  getIrrigationZoneMembers,
  getPlantingBedMembers,
  plantsSharePlantingBed,
  sharedIrrigationZoneIds,
  type IrrigationZoneEntity,
  type PlantEntity,
  type PlantingBedEntity,
} from './landscape'
import {
  createDefaultProject,
  getIrrigationZoneEntity,
  getPlantEntity,
  getPlantingBedEntity,
  type LandscapeProject,
} from './project'
import { applyProjectCommand } from './projectCommands'
import { deserializeProject, serializeProject } from './projectSerialization'

const vegetableBed: PlantingBedEntity = {
  id: 'bed.vegetables',
  kind: 'plantingBed',
  name: 'Vegetable bed',
  footprint: [
    { eastMeters: 0, northMeters: 0 },
    { eastMeters: 4, northMeters: 0 },
    { eastMeters: 4, northMeters: 2 },
    { eastMeters: 0, northMeters: 2 },
  ],
  soil: {
    texture: 'loam',
    drainage: 'wellDrained',
    surfaceCover: 'mulch',
    usableRootDepthMeters: 0.6,
    ph: 6.5,
    organicMatterPercent: 4,
  },
}

const dripZone: IrrigationZoneEntity = {
  id: 'irrigation.drip-a',
  kind: 'irrigationZone',
  name: 'Drip zone A',
  deliveryMethod: 'drip',
  weeklyTargetMillimeters: 25,
}

const tomato: PlantEntity = {
  id: 'plant.tomato-1',
  kind: 'plant',
  name: 'Tomato 1',
  taxonId: 'taxon:solanum-lycopersicum',
  scientificName: 'Solanum lycopersicum',
  cultivar: 'Sungold',
  position: { eastMeters: 1, elevationMeters: 0.5, northMeters: 1 },
  canopyRadiusMeters: 0.4,
  plantingBedId: vegetableBed.id,
  irrigationZoneIds: [dripZone.id],
  interactionGroupIds: [],
}

function addLandscapeEntities(): LandscapeProject {
  const withBed = applyProjectCommand(createDefaultProject(), {
    type: 'landscapeSemantic.add',
    entity: vegetableBed,
  })
  const withZone = applyProjectCommand(withBed, {
    type: 'landscapeSemantic.add',
    entity: dripZone,
  })
  return applyProjectCommand(withZone, {
    type: 'landscapeSemantic.add',
    entity: tomato,
  })
}

describe('landscape semantics', () => {
  it('round-trips beds, irrigation zones, plants, and explicit memberships', () => {
    const project = addLandscapeEntities()

    expect(deserializeProject(serializeProject(project))).toEqual(project)
    expect(getPlantingBedEntity(project, vegetableBed.id)).toEqual(vegetableBed)
    expect(getIrrigationZoneEntity(project, dripZone.id)).toEqual(dripZone)
    expect(getPlantEntity(project, tomato.id)).toEqual(tomato)
  })

  it('keeps visible surface cover within soil metadata', () => {
    const concreteBed: PlantingBedEntity = {
      ...vegetableBed,
      id: 'bed.concrete-covered',
      name: 'Concrete-covered soil',
      soil: { ...vegetableBed.soil, surfaceCover: 'concrete' },
    }
    const project = applyProjectCommand(createDefaultProject(), {
      type: 'landscapeSemantic.add',
      entity: concreteBed,
    })

    expect(getPlantingBedEntity(project, concreteBed.id).soil.surfaceCover).toBe(
      'concrete',
    )
    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })

  it('adds, replaces, and removes semantic entities without mutating inputs', () => {
    const project = addLandscapeEntities()
    const replacement = { ...tomato, canopyRadiusMeters: 0.75 }
    const replaced = applyProjectCommand(project, {
      type: 'landscapeSemantic.replace',
      entity: replacement,
    })
    const removed = applyProjectCommand(replaced, {
      type: 'landscapeSemantic.remove',
      entityId: tomato.id,
    })

    expect(getPlantEntity(project, tomato.id).canopyRadiusMeters).toBe(0.4)
    expect(getPlantEntity(replaced, tomato.id)).toEqual(replacement)
    expect(removed.entities.some(({ id }) => id === tomato.id)).toBe(false)
  })

  it('rejects missing references and removal of a referenced domain', () => {
    expect(() => applyProjectCommand(createDefaultProject(), {
      type: 'landscapeSemantic.add',
      entity: tomato,
    })).toThrow('references missing planting bed')

    const project = addLandscapeEntities()
    expect(() => applyProjectCommand(project, {
      type: 'landscapeSemantic.remove',
      entityId: vegetableBed.id,
    })).toThrow(`references missing planting bed ${vegetableBed.id}`)
    expect(() => applyProjectCommand(project, {
      type: 'landscapeSemantic.remove',
      entityId: dripZone.id,
    })).toThrow(`references missing irrigation zone ${dripZone.id}`)

    const invalidJson = {
      ...project,
      entities: project.entities.filter(({ id }) => id !== dripZone.id),
    }
    expect(() => deserializeProject(JSON.stringify(invalidJson))).toThrow(
      `references missing irrigation zone ${dripZone.id}`,
    )
  })

  it('keeps bed, irrigation, and foliage relationships independent', () => {
    const nearbyPlant: PlantEntity = {
      ...tomato,
      id: 'plant.basil-1',
      name: 'Basil 1',
      taxonId: 'taxon:ocimum-basilicum',
      scientificName: 'Ocimum basilicum',
      cultivar: undefined,
      position: { eastMeters: 2, elevationMeters: 0.5, northMeters: 1 },
      plantingBedId: undefined,
      irrigationZoneIds: [],
      interactionGroupIds: [],
    }
    const baseProject = addLandscapeEntities()
    const project = {
      ...baseProject,
      entities: [...baseProject.entities, nearbyPlant],
    }

    expect(foliageGapMeters(tomato, nearbyPlant)).toBeCloseTo(0.2)
    expect(getFoliageNeighbors(project, tomato.id, 0.25)).toEqual([
      { plant: nearbyPlant, foliageGapMeters: expect.closeTo(0.2) },
    ])
    expect(plantsSharePlantingBed(tomato, nearbyPlant)).toBe(false)
    expect(sharedIrrigationZoneIds(tomato, nearbyPlant)).toEqual([])
    expect(getPlantingBedMembers(project, vegetableBed.id)).toEqual([tomato])
    expect(getIrrigationZoneMembers(project, dripZone.id)).toEqual([tomato])
  })
})
