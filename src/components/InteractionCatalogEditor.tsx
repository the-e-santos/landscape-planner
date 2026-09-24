import { useState } from 'react'
import type { PlantEntity } from '../domain/landscape'
import type {
  EvidenceSource,
  PlantInteractionFinding,
  PlantInteractionGroup,
  PlantInteractionRule,
} from '../domain/plantInteractions'

interface InteractionCatalogEditorProps {
  readonly groups: readonly PlantInteractionGroup[]
  readonly rules: readonly PlantInteractionRule[]
  readonly plants: readonly PlantEntity[]
  readonly findings: readonly PlantInteractionFinding[]
  readonly onAddGroup: () => void
  readonly onReplaceGroup: (group: PlantInteractionGroup) => void
  readonly onRemoveGroup: (groupId: string) => void
  readonly onAddRule: () => string | undefined
  readonly onReplaceRule: (rule: PlantInteractionRule) => void
  readonly onRemoveRule: (ruleId: string) => void
}

function commitText(
  event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  fallback: string,
  commit: (value: string) => void,
  optional = false,
) {
  const value = event.currentTarget.value.trim()
  if (value || optional) commit(value)
  else event.currentTarget.value = fallback
}

function replaceFirstSource(
  rule: PlantInteractionRule,
  source: EvidenceSource,
): PlantInteractionRule {
  return { ...rule, sources: [source, ...rule.sources.slice(1)] }
}

export function InteractionCatalogEditor({
  groups,
  rules,
  plants,
  findings,
  onAddGroup,
  onReplaceGroup,
  onRemoveGroup,
  onAddRule,
  onReplaceRule,
  onRemoveRule,
}: InteractionCatalogEditorProps) {
  const [selectedRuleId, setSelectedRuleId] = useState<string>('')
  const selectedRule = rules.find(({ id }) => id === selectedRuleId) ?? rules[0]

  return (
    <section className="interaction-catalog" aria-label="Plant interaction catalog">
      <div className="section-heading">
        <h2>Interaction groups</h2>
        <button className="text-button" type="button" onClick={onAddGroup}>
          + Add group
        </button>
      </div>
      <p className="field-note">
        Membership is explicit. A plant may belong to zero, one, or several groups.
      </p>
      {groups.length === 0 ? (
        <p className="catalog-empty">No groups defined.</p>
      ) : (
        <div className="catalog-group-list">
          {groups.map((group) => {
            const plantCount = plants.filter(({ interactionGroupIds }) =>
              interactionGroupIds.includes(group.id)
            ).length
            const ruleCount = rules.filter((rule) =>
              rule.sourceGroupId === group.id || rule.targetGroupId === group.id
            ).length
            return (
              <article className="catalog-card" key={group.id}>
                <input
                  aria-label={`Name for ${group.name}`}
                  key={`${group.id}:${group.name}`}
                  defaultValue={group.name}
                  onBlur={(event) => commitText(
                    event,
                    group.name,
                    (name) => onReplaceGroup({ ...group, name }),
                  )}
                />
                <textarea
                  aria-label={`Description for ${group.name}`}
                  key={`${group.id}:${group.description ?? ''}`}
                  defaultValue={group.description ?? ''}
                  placeholder="Optional description"
                  rows={2}
                  onBlur={(event) => commitText(
                    event,
                    group.description ?? '',
                    (description) => {
                      if (description) onReplaceGroup({ ...group, description })
                      else {
                        const { description: _removed, ...withoutDescription } = group
                        onReplaceGroup(withoutDescription)
                      }
                    },
                    true,
                  )}
                />
                <div className="catalog-card-footer">
                  <span>{plantCount} plants · {ruleCount} rules</span>
                  <button
                    type="button"
                    className="danger"
                    disabled={plantCount > 0 || ruleCount > 0}
                    onClick={() => onRemoveGroup(group.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="section-heading catalog-rule-heading">
        <h2>Rules</h2>
        <button
          className="text-button"
          type="button"
          disabled={groups.length === 0}
          onClick={() => {
            const id = onAddRule()
            if (id) setSelectedRuleId(id)
          }}
        >
          + Add rule
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="catalog-empty">
          No user-authored rules. The application ships no botanical claims.
        </p>
      ) : selectedRule ? (
        <div className="catalog-rule-editor">
          <label className="field" htmlFor="selected-interaction-rule">
            <span>Rule</span>
            <select
              id="selected-interaction-rule"
              value={selectedRule.id}
              onChange={(event) => setSelectedRuleId(event.currentTarget.value)}
            >
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>{rule.id}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Source group</span>
            <select
              value={selectedRule.sourceGroupId}
              onChange={(event) => onReplaceRule({
                ...selectedRule,
                sourceGroupId: event.currentTarget.value,
              })}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Target group</span>
            <select
              value={selectedRule.targetGroupId}
              onChange={(event) => onReplaceRule({
                ...selectedRule,
                targetGroupId: event.currentTarget.value,
              })}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <label className="field"><span>Direction</span><select
            value={selectedRule.direction}
            onChange={(event) => onReplaceRule({
              ...selectedRule,
              direction: event.currentTarget.value as PlantInteractionRule['direction'],
            })}
          ><option value="symmetric">Symmetric</option><option value="directed">Directed</option></select></label>
          <label className="field"><span>Effect</span><select
            value={selectedRule.effectType}
            onChange={(event) => onReplaceRule({
              ...selectedRule,
              effectType: event.currentTarget.value as PlantInteractionRule['effectType'],
            })}
          >
            <option value="pest">Pest</option><option value="disease">Disease</option>
            <option value="nutrientCompetition">Nutrient competition</option>
            <option value="allelopathy">Allelopathy</option><option value="pollination">Pollination</option>
            <option value="irrigationCompatibility">Irrigation compatibility</option>
            <option value="structuralSupport">Structural support</option><option value="shading">Shading</option>
          </select></label>
          <label className="field"><span>Polarity</span><select
            value={selectedRule.polarity}
            onChange={(event) => onReplaceRule({
              ...selectedRule,
              polarity: event.currentTarget.value as PlantInteractionRule['polarity'],
            })}
          ><option value="beneficial">Beneficial</option><option value="detrimental">Detrimental</option><option value="contextDependent">Context dependent</option></select></label>
          <label className="field"><span>Domain</span><select
            value={selectedRule.domain.type}
            onChange={(event) => onReplaceRule({
              ...selectedRule,
              domain: event.currentTarget.value === 'foliageProximity'
                ? { type: 'foliageProximity', maximumGapMeters: 0.5 }
                : { type: event.currentTarget.value as 'sharedSoil' | 'sharedIrrigationZone' },
            })}
          ><option value="foliageProximity">Foliage proximity</option><option value="sharedSoil">Shared soil</option><option value="sharedIrrigationZone">Shared irrigation</option></select></label>
          {selectedRule.domain.type === 'foliageProximity' ? (
            <label className="field"><span>Maximum foliage gap</span><span className="number-input"><input
              type="number" min="0" step="0.1"
              value={selectedRule.domain.maximumGapMeters}
              onChange={(event) => {
                const maximumGapMeters = event.currentTarget.valueAsNumber
                if (Number.isFinite(maximumGapMeters) && maximumGapMeters >= 0) {
                  onReplaceRule({ ...selectedRule, domain: { type: 'foliageProximity', maximumGapMeters } })
                }
              }}
            /><span>m</span></span></label>
          ) : null}
          <label className="field"><span>Strength</span><select
            value={selectedRule.strength}
            onChange={(event) => onReplaceRule({ ...selectedRule, strength: event.currentTarget.value as PlantInteractionRule['strength'] })}
          ><option value="weak">Weak</option><option value="moderate">Moderate</option><option value="strong">Strong</option></select></label>
          <label className="field"><span>Confidence</span><select
            value={selectedRule.confidence}
            onChange={(event) => onReplaceRule({ ...selectedRule, confidence: event.currentTarget.value as PlantInteractionRule['confidence'] })}
          ><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <fieldset className="catalog-evidence">
            <legend>Provenance</legend>
            <label className="field"><span>Kind</span><select
              value={selectedRule.sources[0].kind}
              onChange={(event) => onReplaceRule(replaceFirstSource(selectedRule, {
                ...selectedRule.sources[0],
                kind: event.currentTarget.value as EvidenceSource['kind'],
              }))}
            ><option value="personalObservation">Personal observation</option><option value="localKnowledge">Local knowledge</option><option value="extensionGuidance">Extension guidance</option><option value="publication">Publication</option><option value="webResource">Web resource</option><option value="other">Other</option></select></label>
            <input
              aria-label="Evidence title"
              key={`${selectedRule.id}:${selectedRule.sources[0].title}`}
              defaultValue={selectedRule.sources[0].title}
              onBlur={(event) => commitText(event, selectedRule.sources[0].title, (title) =>
                onReplaceRule(replaceFirstSource(selectedRule, { ...selectedRule.sources[0], title })),
              )}
            />
            <input
              aria-label="Evidence URL"
              key={`${selectedRule.id}:${selectedRule.sources[0].url ?? ''}`}
              defaultValue={selectedRule.sources[0].url ?? ''}
              placeholder="Optional URL"
              onBlur={(event) => commitText(event, selectedRule.sources[0].url ?? '', (url) => {
                const source = selectedRule.sources[0]
                if (url) onReplaceRule(replaceFirstSource(selectedRule, { ...source, url }))
                else {
                  const { url: _removed, ...withoutUrl } = source
                  onReplaceRule(replaceFirstSource(selectedRule, withoutUrl))
                }
              }, true)}
            />
          </fieldset>
          <textarea
            aria-label="Rule notes"
            key={`${selectedRule.id}:${selectedRule.notes ?? ''}`}
            defaultValue={selectedRule.notes ?? ''}
            placeholder="Optional rule notes or conditions"
            rows={3}
            onBlur={(event) => commitText(event, selectedRule.notes ?? '', (notes) => {
              if (notes) onReplaceRule({ ...selectedRule, notes })
              else {
                const { notes: _removed, ...withoutNotes } = selectedRule
                onReplaceRule(withoutNotes)
              }
            }, true)}
          />
          <button className="danger catalog-delete-rule" type="button" onClick={() => {
            onRemoveRule(selectedRule.id)
            setSelectedRuleId('')
          }}>Delete rule</button>
        </div>
      ) : null}

      <div className="section-heading catalog-findings-heading"><h2>Guidance</h2><span>{findings.length}</span></div>
      {findings.length === 0 ? (
        <p className="catalog-empty">No user-defined rules match the current plants and relationship domains.</p>
      ) : (
        <div className="catalog-findings">
          {findings.map((finding, index) => (
            <article className={`finding-card finding-${finding.kind}`} key={`${finding.ruleId}:${finding.sourcePlantId}:${finding.targetPlantId}:${index}`}>
              <strong>{finding.summary}</strong>
              <p>{finding.explanation}</p>
              {finding.notes ? <p>{finding.notes}</p> : null}
              {finding.sources.map((source) => source.url
                ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                : <span key={source.id}>{source.title} ({source.kind})</span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
