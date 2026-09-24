import { describe, expect, it } from 'vitest'
import type {
  IrrigationZoneEntity,
  PlantEntity,
  PlantingBedEntity,
} from './landscape'
import {
  evaluatePlantInteractionRules,
  validatePlantInteractionRule,
  validatePlantInteractionRuleSet,
  type EvidenceSource,
  type PlantInteractionRule,
} from './plantInteractions'
import { createDefaultProject, type LandscapeProject } from './project'
import { applyProjectCommand } from './projectCommands'

const evidence: EvidenceSource = {
  id: 'source.example-study',
  title: 'Example study used only as a test fixture',
  authors: 'Test Author',
  publicationYear: 2024,
  url: 'https://example.test/study',
}

const bed: PlantingBedEntity = {
  id: 'bed.test',
  kind: 'plantingBed',
  name: 'Test bed',
  footprint: [
    { eastMeters: 0, northMeters: 0 },
    { eastMeters: 5, northMeters: 0 },
    { eastMeters: 5, northMeters: 5 },
    { eastMeters: 0, northMeters: 5 },
  ],
  soil: {
    texture: 'loam',
    drainage: 'wellDrained',
    surfaceCover: 'mulch',
    usableRootDepthMeters: 0.5,
  },
}

const zone: IrrigationZoneEntity = {
  id: 'irrigation.test',
  kind: 'irrigationZone',
  name: 'Test drip line',
  deliveryMethod: 'drip',
}

const tomato: PlantEntity = {
  id: 'plant.tomato',
  kind: 'plant',
  name: 'Tomato',
  taxonId: 'taxon:tomato',
  scientificName: 'Solanum lycopersicum',
  position: { eastMeters: 1, elevationMeters: 0, northMeters: 1 },
  canopyRadiusMeters: 0.4,
  plantingBedId: bed.id,
  irrigationZoneIds: [zone.id],
}

const basil: PlantEntity = {
  id: 'plant.basil',
  kind: 'plant',
  name: 'Basil',
  taxonId: 'taxon:basil',
  scientificName: 'Ocimum basilicum',
  position: { eastMeters: 2, elevationMeters: 0, northMeters: 1 },
  canopyRadiusMeters: 0.4,
  plantingBedId: bed.id,
  irrigationZoneIds: [zone.id],
}

function createInteractionProject(
  plants: readonly PlantEntity[] = [tomato, basil],
): LandscapeProject {
  const entities = [bed, zone, ...plants]
  return entities.reduce(
    (project, entity) => applyProjectCommand(project, {
      type: 'landscapeSemantic.add',
      entity,
    }),
    createDefaultProject(),
  )
}

function createRule(
  overrides: Partial<PlantInteractionRule> = {},
): PlantInteractionRule {
  return {
    id: 'rule.test',
    sourceTaxonId: tomato.taxonId,
    targetTaxonId: basil.taxonId,
    direction: 'symmetric',
    effectType: 'pollination',
    polarity: 'beneficial',
    domain: { type: 'foliageProximity', maximumGapMeters: 0.25 },
    strength: 'moderate',
    confidence: 'medium',
    sources: [evidence],
    ...overrides,
  }
}

describe('plant interaction rules', () => {
  it('creates one explainable recommendation for a symmetric proximity rule', () => {
    const findings = evaluatePlantInteractionRules(
      createInteractionProject(),
      [createRule()],
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      ruleId: 'rule.test',
      sourcePlantId: tomato.id,
      targetPlantId: basil.id,
      kind: 'recommendation',
      confidence: 'medium',
      sources: [evidence],
    })
    expect(findings[0]?.summary).toContain('potential pollination benefit')
    expect(findings[0]?.explanation).toContain('0.20 m apart')
    expect(findings[0]?.explanation).toContain('Evidence confidence: medium')
  })

  it('honors direction and explains explicit shared-soil membership', () => {
    const rule = createRule({
      direction: 'directed',
      effectType: 'allelopathy',
      polarity: 'detrimental',
      domain: { type: 'sharedSoil' },
      confidence: 'high',
    })

    const findings = evaluatePlantInteractionRules(
      createInteractionProject(),
      [rule],
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      sourcePlantId: tomato.id,
      targetPlantId: basil.id,
      kind: 'warning',
      polarity: 'detrimental',
    })
    expect(findings[0]?.summary).toContain('Tomato → Basil')
    expect(findings[0]?.explanation).toContain(`Test bed planting bed (${bed.id})`)
  })

  it('does not infer shared domains from proximity or footprint overlap', () => {
    const nearbyUnassignedBasil: PlantEntity = {
      ...basil,
      plantingBedId: undefined,
      irrigationZoneIds: [],
    }
    const sharedSoilRule = createRule({ domain: { type: 'sharedSoil' } })
    const sharedIrrigationRule = createRule({
      id: 'rule.irrigation',
      domain: { type: 'sharedIrrigationZone' },
      polarity: 'contextDependent',
    })

    const findings = evaluatePlantInteractionRules(
      createInteractionProject([tomato, nearbyUnassignedBasil]),
      [sharedSoilRule, sharedIrrigationRule],
    )

    expect(findings).toEqual([])
  })

  it('explains shared-irrigation findings separately from soil', () => {
    const findings = evaluatePlantInteractionRules(
      createInteractionProject(),
      [createRule({
        effectType: 'irrigationCompatibility',
        polarity: 'contextDependent',
        domain: { type: 'sharedIrrigationZone' },
      })],
    )

    expect(findings[0]?.kind).toBe('notice')
    expect(findings[0]?.explanation).toContain(
      `Test drip line (${zone.id})`,
    )
  })

  it('requires evidence and validates proximity thresholds', () => {
    expect(() => validatePlantInteractionRule(createRule({ sources: [] })))
      .toThrow('must cite at least one evidence source')
    expect(() => validatePlantInteractionRule(createRule({
      domain: { type: 'foliageProximity', maximumGapMeters: -1 },
    }))).toThrow('Maximum foliage gap')
    expect(() => validatePlantInteractionRuleSet([
      createRule(),
      createRule(),
    ])).toThrow('rule IDs must be unique')
  })

  it('retains applicability conditions and notes in explainable findings', () => {
    const findings = evaluatePlantInteractionRules(
      createInteractionProject(),
      [createRule({
        conditions: { season: 'summer', minimumTemperatureCelsius: 15 },
        notes: 'Confirm the local growing context.',
      })],
    )

    expect(findings[0]?.conditions).toEqual({
      season: 'summer',
      minimumTemperatureCelsius: 15,
    })
    expect(findings[0]?.notes).toBe('Confirm the local growing context.')
  })
})
