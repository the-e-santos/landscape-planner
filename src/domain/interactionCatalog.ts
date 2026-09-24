import {
  INTERACTION_CATALOG_SCHEMA_VERSION,
  validatePlantInteractionCatalog,
  validatePlantInteractionGroup,
  validatePlantInteractionRule,
  type PlantInteractionCatalogDocument,
  type PlantInteractionGroup,
  type PlantInteractionRule,
} from './plantInteractions'

export class InteractionCatalogValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InteractionCatalogValidationError'
  }
}

export function createInteractionCatalog(
  id: string,
  name = 'Plant relationships',
): PlantInteractionCatalogDocument {
  return {
    schemaVersion: INTERACTION_CATALOG_SCHEMA_VERSION,
    id,
    name,
    groups: [],
    rules: [],
  }
}

export function serializeInteractionCatalog(
  catalog: PlantInteractionCatalogDocument,
): string {
  validatePlantInteractionCatalog(catalog)
  return JSON.stringify(catalog, null, 2)
}

export function deserializeInteractionCatalog(
  json: string,
): PlantInteractionCatalogDocument {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new InteractionCatalogValidationError(
      `Catalog JSON is not valid JSON: ${error instanceof Error ? error.message : 'unknown parsing error'}`,
    )
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InteractionCatalogValidationError('catalog: expected an object')
  }
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== INTERACTION_CATALOG_SCHEMA_VERSION) {
    throw new InteractionCatalogValidationError(
      `catalog.schemaVersion: expected version ${INTERACTION_CATALOG_SCHEMA_VERSION}`,
    )
  }
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    throw new InteractionCatalogValidationError('catalog.id: expected a non-empty string')
  }
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    throw new InteractionCatalogValidationError('catalog.name: expected a non-empty string')
  }
  if (!Array.isArray(candidate.groups) || !Array.isArray(candidate.rules)) {
    throw new InteractionCatalogValidationError('catalog: groups and rules must be arrays')
  }
  candidate.groups.forEach((group, index) => {
    if (typeof group !== 'object' || group === null || Array.isArray(group)) {
      throw new InteractionCatalogValidationError(`catalog.groups[${index}]: expected an object`)
    }
    if (typeof (group as { id?: unknown }).id !== 'string') {
      throw new InteractionCatalogValidationError(`catalog.groups[${index}].id: expected a string`)
    }
    if (typeof (group as { name?: unknown }).name !== 'string') {
      throw new InteractionCatalogValidationError(`catalog.groups[${index}].name: expected a string`)
    }
  })
  candidate.rules.forEach((rule, index) => {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      throw new InteractionCatalogValidationError(`catalog.rules[${index}]: expected an object`)
    }
    const record = rule as Record<string, unknown>
    if (typeof record.id !== 'string') {
      throw new InteractionCatalogValidationError(`catalog.rules[${index}].id: expected a string`)
    }
    if (!Array.isArray(record.sources)) {
      throw new InteractionCatalogValidationError(`catalog.rules[${index}].sources: expected an array`)
    }
    if (typeof record.domain !== 'object' || record.domain === null) {
      throw new InteractionCatalogValidationError(`catalog.rules[${index}].domain: expected an object`)
    }
  })
  try {
    validatePlantInteractionCatalog(
      candidate as unknown as PlantInteractionCatalogDocument,
    )
  } catch (error) {
    throw new InteractionCatalogValidationError(
      `catalog: ${error instanceof Error ? error.message : 'invalid catalog'}`,
    )
  }
  return candidate as unknown as PlantInteractionCatalogDocument
}

export type InteractionCatalogCommand =
  | { readonly type: 'catalog.name.set'; readonly name: string }
  | { readonly type: 'group.add'; readonly group: PlantInteractionGroup }
  | { readonly type: 'group.replace'; readonly group: PlantInteractionGroup }
  | { readonly type: 'group.remove'; readonly groupId: string }
  | { readonly type: 'rule.add'; readonly rule: PlantInteractionRule }
  | { readonly type: 'rule.replace'; readonly rule: PlantInteractionRule }
  | { readonly type: 'rule.remove'; readonly ruleId: string }

function cloneRule(rule: PlantInteractionRule): PlantInteractionRule {
  return {
    ...rule,
    domain: { ...rule.domain },
    ...(rule.conditions ? { conditions: { ...rule.conditions } } : {}),
    sources: rule.sources.map((source) => ({ ...source })),
  }
}

export function applyInteractionCatalogCommand(
  catalog: PlantInteractionCatalogDocument,
  command: InteractionCatalogCommand,
): PlantInteractionCatalogDocument {
  let result: PlantInteractionCatalogDocument
  switch (command.type) {
    case 'catalog.name.set':
      if (command.name.trim().length === 0) throw new Error('Catalog name must not be empty')
      result = { ...catalog, name: command.name }
      break
    case 'group.add':
      validatePlantInteractionGroup(command.group)
      if (catalog.groups.some(({ id }) => id === command.group.id)) {
        throw new Error(`Interaction group already exists: ${command.group.id}`)
      }
      result = { ...catalog, groups: [...catalog.groups, { ...command.group }] }
      break
    case 'group.replace': {
      validatePlantInteractionGroup(command.group)
      let found = false
      const groups = catalog.groups.map((group) => {
        if (group.id !== command.group.id) return group
        found = true
        return { ...command.group }
      })
      if (!found) throw new Error(`Interaction group not found: ${command.group.id}`)
      result = { ...catalog, groups }
      break
    }
    case 'group.remove':
      if (catalog.rules.some((rule) =>
        rule.sourceGroupId === command.groupId || rule.targetGroupId === command.groupId
      )) throw new Error(`Interaction group is referenced by a rule: ${command.groupId}`)
      if (!catalog.groups.some(({ id }) => id === command.groupId)) {
        throw new Error(`Interaction group not found: ${command.groupId}`)
      }
      result = {
        ...catalog,
        groups: catalog.groups.filter(({ id }) => id !== command.groupId),
      }
      break
    case 'rule.add':
      validatePlantInteractionRule(command.rule)
      if (catalog.rules.some(({ id }) => id === command.rule.id)) {
        throw new Error(`Interaction rule already exists: ${command.rule.id}`)
      }
      result = { ...catalog, rules: [...catalog.rules, cloneRule(command.rule)] }
      break
    case 'rule.replace': {
      validatePlantInteractionRule(command.rule)
      let found = false
      const rules = catalog.rules.map((rule) => {
        if (rule.id !== command.rule.id) return rule
        found = true
        return cloneRule(command.rule)
      })
      if (!found) throw new Error(`Interaction rule not found: ${command.rule.id}`)
      result = { ...catalog, rules }
      break
    }
    case 'rule.remove':
      if (!catalog.rules.some(({ id }) => id === command.ruleId)) {
        throw new Error(`Interaction rule not found: ${command.ruleId}`)
      }
      result = {
        ...catalog,
        rules: catalog.rules.filter(({ id }) => id !== command.ruleId),
      }
      break
  }
  validatePlantInteractionCatalog(result)
  return result
}
