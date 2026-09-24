import {
  foliageGapMeters,
  plantsSharePlantingBed,
  sharedIrrigationZoneIds,
  type PlantEntity,
} from './landscape'
import type { LandscapeProject } from './project'

export type PlantInteractionEffectType =
  | 'pest'
  | 'disease'
  | 'nutrientCompetition'
  | 'allelopathy'
  | 'pollination'
  | 'irrigationCompatibility'
  | 'structuralSupport'
  | 'shading'

export type PlantInteractionDomain =
  | {
      readonly type: 'foliageProximity'
      /** Maximum edge-to-edge gap between the simplified canopy extents. */
      readonly maximumGapMeters: number
    }
  | { readonly type: 'sharedSoil' }
  | { readonly type: 'sharedIrrigationZone' }

export interface PlantInteractionGroup {
  readonly id: string
  readonly name: string
  readonly description?: string
}

export type EvidenceSourceKind =
  | 'publication'
  | 'extensionGuidance'
  | 'webResource'
  | 'personalObservation'
  | 'localKnowledge'
  | 'other'

export interface EvidenceSource {
  readonly id: string
  readonly kind: EvidenceSourceKind
  readonly title: string
  readonly authors?: string
  readonly publicationYear?: number
  readonly url?: string
  readonly locator?: string
}

export interface PlantInteractionRule {
  readonly id: string
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly direction: 'directed' | 'symmetric'
  readonly effectType: PlantInteractionEffectType
  readonly polarity: 'beneficial' | 'detrimental' | 'contextDependent'
  readonly domain: PlantInteractionDomain
  readonly strength: 'weak' | 'moderate' | 'strong'
  readonly confidence: 'low' | 'medium' | 'high'
  readonly conditions?: Readonly<Record<string, string | number | boolean>>
  readonly sources: readonly EvidenceSource[]
  readonly notes?: string
}

export interface PlantInteractionCatalog {
  readonly groups: readonly PlantInteractionGroup[]
  readonly rules: readonly PlantInteractionRule[]
}

export interface PlantInteractionFinding {
  readonly ruleId: string
  readonly sourcePlantId: string
  readonly targetPlantId: string
  readonly kind: 'recommendation' | 'warning' | 'notice'
  readonly effectType: PlantInteractionEffectType
  readonly polarity: PlantInteractionRule['polarity']
  readonly strength: PlantInteractionRule['strength']
  readonly confidence: PlantInteractionRule['confidence']
  readonly summary: string
  /** Human-readable reason that this rule matched these particular plants. */
  readonly explanation: string
  readonly conditions?: PlantInteractionRule['conditions']
  readonly notes?: string
  readonly sources: readonly EvidenceSource[]
}

function requireText(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

function validateEvidenceSource(source: EvidenceSource): void {
  requireText(source.id, 'Evidence source ID')
  requireText(source.title, 'Evidence source title')
  if (![
    'publication',
    'extensionGuidance',
    'webResource',
    'personalObservation',
    'localKnowledge',
    'other',
  ].includes(source.kind)) {
    throw new Error('Evidence source kind is invalid')
  }
  if (
    source.publicationYear !== undefined &&
    (!Number.isInteger(source.publicationYear) || source.publicationYear < 0)
  ) {
    throw new Error('Evidence source publication year must be a nonnegative integer')
  }
  if (source.url !== undefined) requireText(source.url, 'Evidence source URL')
}

export function validatePlantInteractionRule(rule: PlantInteractionRule): void {
  requireText(rule.id, 'Plant interaction rule ID')
  requireText(rule.sourceGroupId, 'Source interaction group ID')
  requireText(rule.targetGroupId, 'Target interaction group ID')
  if (!['directed', 'symmetric'].includes(rule.direction)) {
    throw new Error('Plant interaction rule direction is invalid')
  }
  if (!Object.hasOwn(EFFECT_LABELS, rule.effectType)) {
    throw new Error('Plant interaction effect type is invalid')
  }
  if (!['beneficial', 'detrimental', 'contextDependent'].includes(rule.polarity)) {
    throw new Error('Plant interaction polarity is invalid')
  }
  if (!['weak', 'moderate', 'strong'].includes(rule.strength)) {
    throw new Error('Plant interaction strength is invalid')
  }
  if (!['low', 'medium', 'high'].includes(rule.confidence)) {
    throw new Error('Plant interaction confidence is invalid')
  }
  if (![
    'foliageProximity',
    'sharedSoil',
    'sharedIrrigationZone',
  ].includes(rule.domain.type)) {
    throw new Error('Plant interaction domain is invalid')
  }
  if (rule.domain.type === 'foliageProximity') {
    if (
      !Number.isFinite(rule.domain.maximumGapMeters) ||
      rule.domain.maximumGapMeters < 0
    ) {
      throw new Error('Maximum foliage gap must be a nonnegative finite number')
    }
  }
  if (rule.sources.length === 0) {
    throw new Error('Plant interaction rules must cite at least one evidence source')
  }
  const sourceIds = new Set(rule.sources.map(({ id }) => id))
  if (sourceIds.size !== rule.sources.length) {
    throw new Error('Plant interaction rule evidence sources must have unique IDs')
  }
  rule.sources.forEach(validateEvidenceSource)
  if (rule.conditions) {
    Object.entries(rule.conditions).forEach(([key, value]) => {
      requireText(key, 'Plant interaction condition name')
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('Numeric plant interaction conditions must be finite')
      }
    })
  }
}

export function validatePlantInteractionGroup(
  group: PlantInteractionGroup,
): void {
  requireText(group.id, 'Plant interaction group ID')
  requireText(group.name, 'Plant interaction group name')
}

export function validatePlantInteractionRuleSet(
  rules: readonly PlantInteractionRule[],
): void {
  rules.forEach(validatePlantInteractionRule)
  const ruleIds = new Set(rules.map(({ id }) => id))
  if (ruleIds.size !== rules.length) {
    throw new Error('Plant interaction rule IDs must be unique')
  }
}

export function validatePlantInteractionCatalog(
  project: LandscapeProject,
): void {
  const { groups, rules } = project.interactionCatalog
  groups.forEach(validatePlantInteractionGroup)
  validatePlantInteractionRuleSet(rules)
  const groupIds = new Set(groups.map(({ id }) => id))
  if (groupIds.size !== groups.length) {
    throw new Error('Plant interaction group IDs must be unique')
  }
  rules.forEach((rule) => {
    if (!groupIds.has(rule.sourceGroupId)) {
      throw new Error(`Rule ${rule.id} references missing source group ${rule.sourceGroupId}`)
    }
    if (!groupIds.has(rule.targetGroupId)) {
      throw new Error(`Rule ${rule.id} references missing target group ${rule.targetGroupId}`)
    }
  })
  project.entities.forEach((entity) => {
    if (entity.kind !== 'plant') return
    entity.interactionGroupIds.forEach((groupId) => {
      if (!groupIds.has(groupId)) {
        throw new Error(`Plant ${entity.id} references missing interaction group ${groupId}`)
      }
    })
  })
}

interface DomainMatch {
  readonly explanation: string
}

function matchDomain(
  project: LandscapeProject,
  source: PlantEntity,
  target: PlantEntity,
  domain: PlantInteractionDomain,
): DomainMatch | undefined {
  switch (domain.type) {
    case 'foliageProximity': {
      const gap = foliageGapMeters(source, target)
      if (gap > domain.maximumGapMeters) return undefined
      return {
        explanation: `Their foliage edges are ${gap.toFixed(2)} m apart, within this rule's ${domain.maximumGapMeters.toFixed(2)} m limit.`,
      }
    }
    case 'sharedSoil': {
      if (!plantsSharePlantingBed(source, target)) return undefined
      const bed = project.entities.find(
        (entity) =>
          entity.kind === 'plantingBed' && entity.id === source.plantingBedId,
      )
      if (!bed) return undefined
      return {
        explanation: `Both plants explicitly belong to the ${bed.name} planting bed (${bed.id}).`,
      }
    }
    case 'sharedIrrigationZone': {
      const zoneIds = sharedIrrigationZoneIds(source, target)
      if (zoneIds.length === 0) return undefined
      const labels = zoneIds.map((zoneId) => {
        const zone = project.entities.find(
          (entity) => entity.kind === 'irrigationZone' && entity.id === zoneId,
        )
        return zone ? `${zone.name} (${zone.id})` : zoneId
      })
      return {
        explanation: `Both plants explicitly use ${labels.join(', ')}.`,
      }
    }
  }
}

const EFFECT_LABELS: Readonly<Record<PlantInteractionEffectType, string>> = {
  pest: 'pest interaction',
  disease: 'disease interaction',
  nutrientCompetition: 'nutrient competition',
  allelopathy: 'allelopathy',
  pollination: 'pollination',
  irrigationCompatibility: 'irrigation compatibility',
  structuralSupport: 'structural support',
  shading: 'shading',
}

function createFinding(
  rule: PlantInteractionRule,
  source: PlantEntity,
  target: PlantEntity,
  domainMatch: DomainMatch,
): PlantInteractionFinding {
  const effect = EFFECT_LABELS[rule.effectType]
  const subject = rule.direction === 'symmetric'
    ? `${source.name} and ${target.name}`
    : `${source.name} → ${target.name}`
  const kind = rule.polarity === 'beneficial'
    ? 'recommendation'
    : rule.polarity === 'detrimental'
      ? 'warning'
      : 'notice'
  const summary = rule.polarity === 'beneficial'
    ? `${subject}: potential ${effect} benefit`
    : rule.polarity === 'detrimental'
      ? `${subject}: potential detrimental ${effect}`
      : `${subject}: context-dependent ${effect}`

  return {
    ruleId: rule.id,
    sourcePlantId: source.id,
    targetPlantId: target.id,
    kind,
    effectType: rule.effectType,
    polarity: rule.polarity,
    strength: rule.strength,
    confidence: rule.confidence,
    summary,
    explanation: `${domainMatch.explanation} Evidence confidence: ${rule.confidence}; ${rule.sources.length} cited source${rule.sources.length === 1 ? '' : 's'}.`,
    ...(rule.conditions ? { conditions: { ...rule.conditions } } : {}),
    ...(rule.notes ? { notes: rule.notes } : {}),
    sources: rule.sources.map((citation) => ({ ...citation })),
  }
}

function groupsMatch(
  source: PlantEntity,
  target: PlantEntity,
  rule: PlantInteractionRule,
): boolean {
  return source.interactionGroupIds.includes(rule.sourceGroupId) &&
    target.interactionGroupIds.includes(rule.targetGroupId)
}

/**
 * Evaluates only relationship domains represented explicitly by the project.
 * It never infers soil or irrigation membership from overlapping geometry.
 */
export function evaluatePlantInteractionRules(
  project: LandscapeProject,
  rules: readonly PlantInteractionRule[] = project.interactionCatalog.rules,
): readonly PlantInteractionFinding[] {
  validatePlantInteractionRuleSet(rules)
  const plants = project.entities.filter(
    (entity): entity is PlantEntity => entity.kind === 'plant',
  )
  const findings: PlantInteractionFinding[] = []

  rules.forEach((rule) => {
    for (let leftIndex = 0; leftIndex < plants.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < plants.length;
        rightIndex += 1
      ) {
        const left = plants[leftIndex]
        const right = plants[rightIndex]
        const orientations = rule.direction === 'symmetric'
          ? groupsMatch(left, right, rule)
            ? [[left, right] as const]
            : groupsMatch(right, left, rule)
              ? [[right, left] as const]
              : []
          : [
              ...(groupsMatch(left, right, rule)
                ? [[left, right] as const]
                : []),
              ...(groupsMatch(right, left, rule)
                ? [[right, left] as const]
                : []),
            ]

        orientations.forEach(([source, target]) => {
          const domainMatch = matchDomain(project, source, target, rule.domain)
          if (domainMatch) {
            findings.push(createFinding(rule, source, target, domainMatch))
          }
        })
      }
    }
  })

  return findings
}
