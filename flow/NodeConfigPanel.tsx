'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Info, Plus, Trash2, X } from 'lucide-react'
import { NODE_META, nodeToneClasses, type FlowNode } from '@/types/flow'
import { credentialsApi, type CredentialSummary } from '@/services/api'


// ============================================================
// NODE CONFIG PANEL
// ============================================================

export function NodeConfigPanel({
  node,
  onChange,
  onClose,
  availableNodes = [],
}: {
  node: FlowNode
  onChange: (config: Partial<FlowNode['config']>) => void
  onClose: () => void
  availableNodes?: FlowNode[]
}) {
  const [draft, setDraft] = useState(node.config)
  const [showKey, setShowKey] = useState(false)
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [credentialLoading, setCredentialLoading] = useState(false)
  const [credentialError, setCredentialError] = useState('')
  const [creatingCredential, setCreatingCredential] = useState(false)

  useEffect(() => {
    if (node.type !== 'ai') return
    setCredentialLoading(true)
    credentialsApi.list()
      .then(setCredentials)
      .catch((err) => setCredentialError(err?.message || 'Unable to load credentials'))
      .finally(() => setCredentialLoading(false))
  }, [node.type])

  const update = (
    key: keyof FlowNode['config'],
    value: any
  ) =>
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))

  const save = async () => {
    let nextDraft = { ...draft }

    // API keys are credentials, not workflow configuration. If the user is
    // creating one inline, store it in the backend first and only keep the id.
    if (node.type === 'ai' && creatingCredential) {
      if (!draft.api_key?.trim()) {
        setCredentialError('Enter an API key to create the credential.')
        return
      }
      try {
        setCredentialLoading(true)
        const credential = await credentialsApi.create({
          name: draft.credential_name?.trim() || `${draft.provider || 'AI'} credential`,
          provider: draft.provider || 'custom',
          api_key: draft.api_key.trim(),
          api_url: draft.provider === 'custom' ? draft.api_url || undefined : undefined,
        })
        setCredentials((items) => [...items, credential])
        nextDraft = {
          ...nextDraft,
          credential_id: credential.id,
          api_key: '',
          credential_name: credential.name,
        }
        setCreatingCredential(false)
      } catch (err: any) {
        setCredentialError(err?.message || 'Failed to create credential')
        return
      } finally {
        setCredentialLoading(false)
      }
    }

    // Never pass a raw API key back into the flow state after a credential is selected.
    if (node.type === 'ai') nextDraft.api_key = ''
    onChange(nextDraft)
    onClose()
  }

  return (
    <aside className="config-panel">

      {/* ====================================================
          HEADER
          ==================================================== */}

      <div className="config-header">

        <div>
          <div className={`eyebrow ${nodeToneClasses[node.type]}`}>
            {NODE_META[node.type].label}
          </div>

          <h2>Configure step</h2>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X size={18} />
        </button>

      </div>


      {/* ====================================================
          BODY
          ==================================================== */}

      <div className="config-body">

        {/* Step name — always shown */}

        <label>
          Step name

          <input
            value={draft.label}
            onChange={(e) => update('label', e.target.value)}
            placeholder="e.g. Welcome message"
          />
        </label>


        {/* ================================================
            MESSAGE / INPUT TEXT
            ================================================ */}

        {['message', 'input'].includes(node.type) && (
          <label>
            Message text

            <textarea
              value={draft.text || ''}
              onChange={(e) => update('text', e.target.value)}
              rows={5}
              placeholder="Type your message…"
            />
          </label>
        )}


        {/* ================================================
            INPUT — SAVE AS VARIABLE
            ================================================ */}

        {node.type === 'input' && (
          <label>
            Save response as

            <input
              value={draft.variable || ''}
              onChange={(e) => update('variable', e.target.value)}
              placeholder="e.g. customer_name"
            />

            <span className="config-note" style={{ marginTop: 4 }}>
              Use <code>{'{{customer_name}}'}</code> in later messages.
            </span>
          </label>
        )}


        {/* ================================================
            END NODE
            ================================================ */}

        {node.type === 'end' && (
          <label>
            Final message (optional)

            <textarea
              value={draft.text || ''}
              onChange={(e) => update('text', e.target.value)}
              rows={4}
              placeholder="Thanks! Your workflow is complete."
            />

            <span className="config-note">
              The workflow is marked completed when this node runs. If you omit a final message, the previous response is kept.
            </span>
          </label>
        )}


        {/* ================================================
            SWITCH
            ================================================ */}

        {node.type === 'switch' && (
          <>
            <label>
              Value to inspect
              <input
                value={draft.variable || ''}
                onChange={(e) => update('variable', e.target.value)}
                placeholder="e.g. shoe_type"
              />
              <span className="config-note">
                The switch compares this variable to each case value.
              </span>
            </label>

            <label>
              Cases
              <div className="option-list">
                {(draft.cases || []).map((item: any, index: number) => (
                  <div className="option-row" key={`${item.value}-${index}`}>
                    <input
                      value={item.label || ''}
                      placeholder="Label"
                      onChange={(e) => update('cases', (draft.cases || []).map((c: any, i: number) => i === index ? { ...c, label: e.target.value } : c))}
                    />
                    <input
                      value={item.value || ''}
                      placeholder="Value"
                      onChange={(e) => update('cases', (draft.cases || []).map((c: any, i: number) => i === index ? { ...c, value: e.target.value } : c))}
                    />
                    <select
                      value={item.next_node || ''}
                      onChange={(e) => update('cases', (draft.cases || []).map((c: any, i: number) => i === index ? { ...c, next_node: e.target.value || undefined } : c))}
                    >
                      <option value="">Use outgoing edge {index + 1}</option>
                      {availableNodes.filter((n) => n.id !== node.id).map((n) => (
                        <option key={n.id} value={n.id}>{n.config.label} ({n.type})</option>
                      ))}
                    </select>
                    <button type="button" className="icon-button" onClick={() => update('cases', (draft.cases || []).filter((_: any, i: number) => i !== index))} aria-label="Remove case">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="subtle-button" style={{ marginTop: 6 }} onClick={() => update('cases', [...(draft.cases || []), { label: `Case ${(draft.cases || []).length + 1}`, value: `case_${(draft.cases || []).length + 1}` }])}>
                <Plus size={14} /> Add case
              </button>
            </label>

            <label>
              Default route
              <select value={draft.default_next_node || ''} onChange={(e) => update('default_next_node', e.target.value || undefined)}>
                <option value="">Use final outgoing edge</option>
                {availableNodes.filter((n) => n.id !== node.id).map((n) => (
                  <option key={n.id} value={n.id}>{n.config.label} ({n.type})</option>
                ))}
              </select>
            </label>
          </>
        )}


        {/* ================================================
            BUTTONS — OPTION LIST
            ================================================ */}

        {node.type === 'buttons' && (
          <label>
            Button options

            <div className="option-list">
              {(draft.options || []).map((option, index) => (
                <div className="option-row" key={`${option}-${index}`}>
                  <input
                    value={option}
                    placeholder={`Option ${index + 1}`}
                    onChange={(e) =>
                      update(
                        'options',
                        (draft.options || []).map((item, i) =>
                          i === index ? e.target.value : item
                        )
                      )
                    }
                  />

                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      update(
                        'options',
                        (draft.options || []).filter((_, i) => i !== index)
                      )
                    }
                    aria-label="Remove option"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="subtle-button"
              style={{ marginTop: 6 }}
              onClick={() =>
                update('options', [
                  ...(draft.options || []),
                  `Option ${(draft.options || []).length + 1}`,
                ])
              }
            >
              <Plus size={14} />
              Add option
            </button>

            <span className="config-note" style={{ marginTop: 6 }}>
              Connect each button to the next node by drawing an edge from the output handle on the canvas.
            </span>
          </label>
        )}


        {/* ================================================
            CONDITION
            ================================================ */}

        {node.type === 'condition' && (
          <label>
            Condition expression

            <textarea
              value={draft.condition || ''}
              onChange={(e) => update('condition', e.target.value)}
              rows={3}
              placeholder="e.g. customer.is_returning == true"
            />

            <span className="config-note" style={{ marginTop: 4 }}>
              Draw a <strong>True</strong> and a <strong>False</strong> edge from this node on the canvas.
            </span>
          </label>
        )}


        {/* ================================================
            AI RESPONSE NODE
            ================================================ */}

        {node.type === 'ai' && (
          <>
            <div className="ai-callout">
              <div className="ai-callout-header">
                <Info size={13} />
                <span>Generic AI provider</span>
              </div>
              <p>
                Select a provider and a saved credential. API keys are stored securely by the backend,
                not inside your workflow JSON.
              </p>
            </div>

            <label>
              System instructions / prompt
              <textarea
                value={draft.prompt || ''}
                onChange={(e) => update('prompt', e.target.value)}
                rows={5}
                placeholder="You are a helpful assistant…"
              />
            </label>

            <label>
              Provider
              <select
                value={draft.provider || 'openai'}
                onChange={(e) => {
                  const provider = e.target.value
                  const presets: Record<string, { url: string; model: string }> = {
                    openai: { url: '', model: 'gpt-4o-mini' },
                    groq: { url: '', model: 'openai/gpt-oss-120b' },
                    anthropic: { url: '', model: 'claude-sonnet-4-6' },
                    gemini: { url: '', model: 'gemini-2.0-flash' },
                    custom: { url: '', model: '' },
                  }
                  const preset = presets[provider] || presets.custom
                  setDraft((current) => ({
                    ...current,
                    provider,
                    api_url: preset.url,
                    model: preset.model,
                    credential_id: '',
                    api_key: '',
                    credential_name: '',
                  }))
                  setCreatingCredential(false)
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
                <option value="custom">Custom / OpenAI-compatible</option>
              </select>
            </label>

            <label>
              Credential
              <select
                value={creatingCredential ? '__new__' : (draft.credential_id || '')}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setCreatingCredential(true)
                    update('credential_id', '')
                    update('api_key', '')
                    update('credential_name', '')
                  } else {
                    setCreatingCredential(false)
                    update('credential_id', e.target.value)
                    update('api_key', '')
                  }
                }}
                disabled={credentialLoading}
              >
                <option value="">{credentialLoading ? 'Loading credentials…' : 'Select a credential'}</option>
                {credentials
                  .filter((credential) => credential.provider === (draft.provider || 'openai'))
                  .map((credential) => (
                    <option key={credential.id} value={credential.id}>{credential.name}</option>
                  ))}
                <option value="__new__">+ Add new credential…</option>
              </select>
            </label>

            {creatingCredential && (
              <>
                <label>
                  Credential name
                  <input
                    value={draft.credential_name || ''}
                    onChange={(e) => update('credential_name', e.target.value)}
                    placeholder={`My ${draft.provider || 'AI'} credential`}
                  />
                </label>

                <label>
                  API key
                  <div className="password-row">
                    <input
                      value={draft.api_key || ''}
                      onChange={(e) => update('api_key', e.target.value)}
                      placeholder="Paste provider API key"
                      type={showKey ? 'text' : 'password'}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                      title={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </label>
              </>
            )}

            {credentialError && (
              <div className="config-note" style={{ color: '#b91c1c', background: '#fef2f2' }}>
                {credentialError}
              </div>
            )}

            <label>
              Model
              <input
                value={draft.model || ''}
                onChange={(e) => update('model', e.target.value)}
                placeholder="Provider model name"
              />
            </label>

            <label>
              API URL <span className="config-note">(optional for built-in providers)</span>
              <input
                value={draft.api_url || ''}
                onChange={(e) => update('api_url', e.target.value)}
                placeholder={
                  draft.provider === 'custom'
                    ? 'https://your-provider.example/v1/chat/completions'
                    : 'Leave blank to use provider default'
                }
                type="url"
              />
            </label>

            <div className="config-note" style={{
              borderLeft: '3px solid #10b981',
              background: '#f0fdf4',
              color: '#065f46',
            }}>
              ✓ Your API key is stored as a credential. The workflow only stores the credential ID.
            </div>
          </>
        )}
        {/* ================================================
            ERROR HANDLING
            ================================================ */}

        {!['start', 'end'].includes(node.type) && (
          <label>
            On error
            <select
              value={draft.error_next_node || ''}
              onChange={(e) => update('error_next_node', e.target.value || undefined)}
            >
              <option value="">Stop workflow and report error</option>
              {availableNodes.filter((n) => n.id !== node.id).map((n) => (
                <option key={n.id} value={n.id}>Go to {n.config.label} ({n.type})</option>
              ))}
            </select>
            <span className="config-note">
              When execution fails, the error is available as <code>{'{{error_message}}'}</code> and the workflow can continue through the selected node.
            </span>
          </label>
        )}


        {/* ================================================
            GENERIC NOTE
            ================================================ */}

        {node.type !== 'ai' && (
          <div className="config-note">
            Changes are reflected on the canvas immediately after saving.
          </div>
        )}

      </div>


      {/* ====================================================
          FOOTER
          ==================================================== */}

      <div className="config-footer">

        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
        >
          Cancel
        </button>

        <button
          type="button"
          className="primary-button"
          onClick={save}
        >
          Save changes
        </button>

      </div>

    </aside>
  )
}
