import { describe, expect, it } from 'vitest'
import {
  applyInteractionCatalogCommand,
  createInteractionCatalog,
  deserializeInteractionCatalog,
  serializeInteractionCatalog,
} from './interactionCatalog'
import type { PlantInteractionRule } from './plantInteractions'

const groupA = { id: 'group.a', name: 'Group A' }
const groupB = { id: 'group.b', name: 'Group B' }
const rule: PlantInteractionRule = {
  id: 'rule.a-b',
  sourceGroupId: groupA.id,
  targetGroupId: groupB.id,
  direction: 'directed',
  effectType: 'disease',
  polarity: 'detrimental',
  domain: { type: 'sharedSoil' },
  strength: 'moderate',
  confidence: 'low',
  sources: [{
    id: 'source.personal',
    kind: 'personalObservation',
    title: 'Garden observation',
  }],
}

describe('interaction catalog document', () => {
  it('round-trips independently from a landscape project', () => {
    let catalog = createInteractionCatalog('catalog.test', 'Test catalog')
    catalog = applyInteractionCatalogCommand(catalog, {
      type: 'group.add',
      group: groupA,
    })
    catalog = applyInteractionCatalogCommand(catalog, {
      type: 'group.add',
      group: groupB,
    })
    catalog = applyInteractionCatalogCommand(catalog, {
      type: 'rule.add',
      rule,
    })

    expect(deserializeInteractionCatalog(serializeInteractionCatalog(catalog)))
      .toEqual(catalog)
  })

  it('rejects unsupported and malformed catalog documents', () => {
    expect(() => deserializeInteractionCatalog(JSON.stringify({
      schemaVersion: 2,
      id: 'catalog.future',
      name: 'Future',
      groups: [],
      rules: [],
    }))).toThrow('expected version 1')
    expect(() => deserializeInteractionCatalog(JSON.stringify({
      schemaVersion: 1,
      id: 'catalog.invalid',
      name: 'Invalid',
      groups: [],
      rules: [{}],
    }))).toThrow('catalog.rules[0].id')
  })

  it('protects catalog-internal rule references', () => {
    let catalog = createInteractionCatalog('catalog.test')
    catalog = applyInteractionCatalogCommand(catalog, { type: 'group.add', group: groupA })
    catalog = applyInteractionCatalogCommand(catalog, { type: 'group.add', group: groupB })
    catalog = applyInteractionCatalogCommand(catalog, { type: 'rule.add', rule })

    expect(() => applyInteractionCatalogCommand(catalog, {
      type: 'group.remove',
      groupId: groupA.id,
    })).toThrow('referenced by a rule')
  })
})
