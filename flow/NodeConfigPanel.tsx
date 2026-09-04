'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Info, Plus, Trash2, X } from 'lucide-react'
import { NODE_META, nodeToneClasses, type FlowNode } from '@/types/flow'
import { credentialsApi, dataSourceApi, type CredentialSummary } from '@/services/api'


// ============================================================
// NODE CONFIG PANEL
// ============================================================

export function NodeConfigPanel({
  node,
  onChange,
  onClose,
  availableNodes = [],
  flowId,
}: {
  node: FlowNode
  onChange: (config: Partial<FlowNode['config']>) => void
  onClose: () => void
  availableNodes?: FlowNode[]
  flowId?: string
}) {
  const [draft, setDraft] = useState(node.config || {})
  const initialConfigRef = useRef(node.config || {})
  const [showKey, setShowKey] = useState(false)

  // Reset the editor when switching to a different node. For Each is kept
  // synchronized with the parent flow as its fields change, so do not watch
  // node.config here (that would overwrite the user's current keystroke).
  useEffect(() => {
    const config = node.config || {}
    setDraft(config)
    initialConfigRef.current = { ...config }
  }, [node.id])
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [credentialLoading, setCredentialLoading] = useState(false)
  const [credentialError, setCredentialError] = useState('')
  const [creatingCredential, setCreatingCredential] = useState(false)

  // Data Source — inline credential fields + test-step state
  const [dbHost, setDbHost] = useState('')
  const [dbPort, setDbPort] = useState('')
  const [dbDatabase, setDbDatabase] = useState('')
  const [dbUsername, setDbUsername] = useState('')
  const [dbPassword, setDbPassword] = useState('')
  const [restBaseUrl, setRestBaseUrl] = useState('')
  const [restApiKey, setRestApiKey] = useState('')
  const [restAuthHeader, setRestAuthHeader] = useState('Authorization')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ count: number; sample: Record<string, any>[] } | null>(null)
  const [testError, setTestError] = useState('')

  useEffect(() => {
    if (node.type !== 'ai' && node.type !== 'data_source' && node.type !== 'whatsapp') return
    setCredentialLoading(true)
    credentialsApi.list()
      .then(setCredentials)
      .catch((err) => setCredentialError(err?.message || 'Unable to load credentials'))
      .finally(() => setCredentialLoading(false))
  }, [node.type])

  const update = (
    key: keyof FlowNode['config'],
    value: any
  ) => {
    const next = { ...draft, [key]: value }
    setDraft(next)

    // For Each configuration is part of the flow itself. Commit it to the
    // parent immediately so a global Save cannot capture an older draft and
    // reopening the node always shows the configured variable names.
    if (node.type === 'for_each') {
      onChange(next)
    }
  }

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

    if (node.type === 'whatsapp' && creatingCredential) {
      const channelProvider = draft.channel_provider || 'whatsapp'
      if (!draft.api_key?.trim()) {
        setCredentialError(channelProvider === '360dialog'
          ? 'Enter the 360dialog API key.'
          : 'Enter the WhatsApp access token.')
        return
      }
      if (channelProvider !== '360dialog' && !draft.phone_number_id?.trim()) {
        setCredentialError('Enter the WhatsApp phone_number_id.')
        return
      }
      if (channelProvider === '360dialog' && (draft.dialog_environment || 'sandbox') === 'sandbox' && !draft.default_to_phone?.trim() && !draft.to?.trim()) {
        setCredentialError('Enter your sandbox test WhatsApp number in E.164 format, e.g. +923001234567.')
        return
      }
      try {
        setCredentialLoading(true)
        const credential = await credentialsApi.create({
          name: draft.credential_name?.trim() || (channelProvider === '360dialog' ? '360dialog WhatsApp' : 'WhatsApp number'),
          provider: channelProvider,
          api_key: draft.api_key.trim(),
          extra: channelProvider === '360dialog'
            ? {
                environment: draft.dialog_environment || 'sandbox',
                ...(draft.default_to_phone?.trim() ? { default_to_phone: draft.default_to_phone.trim() } : {}),
                ...(draft.flow_id_for_replies?.trim() ? { flow_id: draft.flow_id_for_replies.trim() } : {}),
              }
            : {
                phone_number_id: draft.phone_number_id!.trim(),
                ...(draft.verify_token?.trim() ? { verify_token: draft.verify_token.trim() } : {}),
                ...(draft.flow_id_for_replies?.trim() ? { flow_id: draft.flow_id_for_replies.trim() } : {}),
              },
        })
        setCredentials((items) => [...items, credential])
        nextDraft = {
          ...nextDraft,
          channel_provider: channelProvider,
          credential_id: credential.id,
          credential_name: credential.name,
          to: nextDraft.to?.trim() || draft.default_to_phone?.trim() || '',
          api_key: '', phone_number_id: '', verify_token: '', default_to_phone: '',
          dialog_environment: 'sandbox', flow_id_for_replies: '',
        }
        setCreatingCredential(false)
      } catch (err: any) {
        setCredentialError(err?.message || 'Failed to create credential')
        return
      } finally {
        setCredentialLoading(false)
      }
    }

    if (node.type === 'whatsapp') nextDraft.api_key = ''

    if (node.type === 'data_source' && creatingCredential) {
      const sourceType = draft.source_type || 'postgresql'
      try {
        setCredentialLoading(true)
        let credential: CredentialSummary
        if (sourceType === 'rest_api') {
          if (!restBaseUrl.trim()) {
            setCredentialError('Enter a base URL to create the credential.')
            return
          }
          credential = await credentialsApi.create({
            name: draft.credential_name?.trim() || 'REST API credential',
            provider: 'rest_api',
            api_key: restApiKey.trim(),
            extra: { base_url: restBaseUrl.trim(), auth_header: restAuthHeader.trim() || 'Authorization' },
          })
        } else {
          if (!dbHost.trim() || !dbDatabase.trim()) {
            setCredentialError('Host and database are required to create the credential.')
            return
          }
          credential = await credentialsApi.create({
            name: draft.credential_name?.trim() || `${sourceType} credential`,
            provider: sourceType,
            extra: {
              host: dbHost.trim(),
              port: dbPort.trim(),
              database: dbDatabase.trim(),
              username: dbUsername.trim(),
              password: dbPassword.trim(),
            },
          })
        }
        setCredentials((items) => [...items, credential])
        nextDraft = { ...nextDraft, credential_id: credential.id, credential_name: credential.name }
        setCreatingCredential(false)
      } catch (err: any) {
        setCredentialError(err?.message || 'Failed to create credential')
        return
      } finally {
        setCredentialLoading(false)
      }
    }

    onChange(nextDraft)
    onClose()
  }

  const runTest = async () => {
    setTesting(true)
    setTestError('')
    setTestResult(null)
    try {
      let credentialId = draft.credential_id || undefined
      const sourceType = draft.source_type || 'postgresql'

      // If the user is still filling in a brand-new credential inline (the
      // "+ Add new credential…" fields), it hasn't been persisted yet — the
      // panel only saves it when the main "Save" button is clicked. Without
      // this, "Test this step" would send an empty credential_id and the
      // backend would reject it with "needs a saved database credential."
      // So: create the credential here first, exactly like save() does,
      // then use the resulting id for the test call.
      if (creatingCredential && sourceType !== 'csv') {
        if (sourceType === 'rest_api') {
          if (!restBaseUrl.trim()) {
            setTestError('Enter a base URL to create the credential.')
            return
          }
          const credential = await credentialsApi.create({
            name: draft.credential_name?.trim() || 'REST API credential',
            provider: 'rest_api',
            api_key: restApiKey.trim(),
            extra: { base_url: restBaseUrl.trim(), auth_header: restAuthHeader.trim() || 'Authorization' },
          })
          setCredentials((items) => [...items, credential])
          setDraft((current) => ({ ...current, credential_id: credential.id, credential_name: credential.name }))
          setCreatingCredential(false)
          credentialId = credential.id
        } else {
          if (!dbHost.trim() || !dbDatabase.trim()) {
            setTestError('Host and database are required to create the credential.')
            return
          }
          const credential = await credentialsApi.create({
            name: draft.credential_name?.trim() || `${sourceType} credential`,
            provider: sourceType,
            extra: {
              host: dbHost.trim(),
              port: dbPort.trim(),
              database: dbDatabase.trim(),
              username: dbUsername.trim(),
              password: dbPassword.trim(),
            },
          })
          setCredentials((items) => [...items, credential])
          setDraft((current) => ({ ...current, credential_id: credential.id, credential_name: credential.name }))
          setCreatingCredential(false)
          credentialId = credential.id
        }
      }

      if (!credentialId && (sourceType === 'postgresql' || sourceType === 'mysql')) {
        setTestError('Select or create a credential first.')
        return
      }

      const result = await dataSourceApi.test({
        source_type: sourceType,
        operation: draft.operation || 'fetch',
        query_mode: (draft.query_mode || 'simple') as 'simple' | 'sql',
        credential_id: credentialId,
        table: draft.table || undefined,
        query: draft.query || undefined,
        endpoint: draft.endpoint || undefined,
        base_url: draft.base_url || undefined,
        file_name: draft.file_name || undefined,
        filters: draft.filters || undefined,
        values: draft.values || undefined,
        limit: 5,
      })
      setTestResult({ count: result.count, sample: result.sample })
    } catch (err: any) {
      setTestError(err?.message || 'Test failed')
    } finally {
      setTesting(false)
    }
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
                  const value = e.target.value
                  if (value === '__new__') {
                    setCreatingCredential(true)
                    setDraft((current) => ({
                      ...current,
                      credential_id: '',
                      credential_name: '',
                      api_key: '',
                    }))
                  } else {
                    setCreatingCredential(false)
                    const selected = credentials.find((credential) => credential.id === value)
                    setDraft((current) => ({
                      ...current,
                      credential_id: value,
                      credential_name: selected?.name || '',
                      api_key: '',
                    }))
                  }
                  setCredentialError('')
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
            FOR EACH / LOOP NODE
            ================================================ */}

        {node.type === 'for_each' && (
          <>
            <div className="ai-callout" style={{
              background: '#eef2ff',
              borderColor: '#c7d2fe',
              color: '#3730a3',
            }}>
              <div className="ai-callout-header" style={{ color: '#4f46e5' }}>
                <Info size={13} />
                <span>Iterate safely</span>
              </div>
              <p style={{ color: '#3730a3' }}>
                Process one record at a time. Connect <strong>Each</strong> to
                the work you want repeated, then connect the last repeated node
                back to this Loop. <strong>Done</strong> continues after the last item.
              </p>
            </div>

            <label>
              Input list
              <input
                value={draft.input_variable || 'records'}
                onChange={(e) => update('input_variable', e.target.value)}
                placeholder="records"
              />
              <span className="config-note">
                The variable must contain a list, for example <code>{'{{records}}'}</code>.
                For Each settings are saved to the flow as you edit them.
              </span>
            </label>

            <label>
              Current item variable
              <input
                value={draft.item_variable || 'current_item'}
                onChange={(e) => update('item_variable', e.target.value)}
                placeholder="current_item"
              />
              <span className="config-note">
                Inside the loop use paths such as <code>{'{{current_item.full_name}}'}</code>.
              </span>
            </label>

            <label>
              Index variable
              <input
                value={draft.index_variable || 'index'}
                onChange={(e) => update('index_variable', e.target.value)}
                placeholder="index"
              />
            </label>
          </>
        )}

        {/* ================================================
            WHATSAPP NODE
            ================================================ */}

        {node.type === 'whatsapp' && (
          <>
            <div className="ai-callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#065f46' }}>
              <div className="ai-callout-header" style={{ color: '#16a34a' }}>
                <Info size={13} />
                <span>WhatsApp — Meta or 360dialog</span>
              </div>
              <p style={{ color: '#065f46' }}>
                Use Meta Cloud API, or 360dialog Sandbox to test the chatbot with the API key you received.
              </p>
            </div>

            <label>
              Provider
              <select
                value={draft.channel_provider || 'whatsapp'}
                onChange={(e) => {
                  const channel_provider = e.target.value as 'whatsapp' | '360dialog'
                  setDraft((current) => ({
                    ...current,
                    channel_provider,
                    credential_id: '',
                    credential_name: '',
                    api_key: '',
                    phone_number_id: '',
                    verify_token: '',
                    default_to_phone: '',
                    dialog_environment: 'sandbox',
                  }))
                  setCreatingCredential(false)
                  setCredentialError('')
                }}
              >
                <option value="whatsapp">Meta WhatsApp Cloud API</option>
                <option value="360dialog">360dialog WhatsApp / Sandbox</option>
              </select>
            </label>

            <label>
              To (phone number)
              <input value={draft.to || ''} onChange={(e) => update('to', e.target.value)} placeholder="Optional override, e.g. {{current_item.phone}} or +923001234567" />
            </label>

            <label>
              Message
              <textarea value={draft.message || ''} onChange={(e) => update('message', e.target.value)} rows={4} placeholder="e.g. {{ai_response}}" />
            </label>

            <label>
              WhatsApp credential
              <select
                value={creatingCredential ? '__new__' : (draft.credential_id || '')}
                onChange={(e) => {
                  const credentialId = e.target.value
                  if (credentialId === '__new__') {
                    setCreatingCredential(true)
                    setDraft((current) => ({
                      ...current,
                      credential_id: '',
                      api_key: '',
                      credential_name: '',
                      default_to_phone: '',
                    }))
                  } else {
                    setCreatingCredential(false)
                    const selectedCredential = credentials.find((item) => item.id === credentialId)
                    setDraft((current) => ({
                      ...current,
                      credential_id: credentialId,
                      api_key: '',
                      credential_name: selectedCredential?.name || current.credential_name || '',
                      // The selected credential is authoritative for the provider.
                      channel_provider: (selectedCredential?.provider === '360dialog' ? '360dialog' : current.channel_provider) as any,
                    }))
                  }
                  setCredentialError('')
                }}
                disabled={credentialLoading}
              >
                <option value="">{credentialLoading ? 'Loading credentials…' : 'Select a credential'}</option>
                {credentials
                  .filter((credential) => credential.provider === (draft.channel_provider || 'whatsapp'))
                  .map((credential) => (
                    <option key={credential.id} value={credential.id}>{credential.name}</option>
                  ))}
                <option value="__new__">+ Connect a new credential…</option>
              </select>
            </label>

            {creatingCredential && (
              <>
                <label>
                  Credential name
                  <input value={draft.credential_name || ''} onChange={(e) => update('credential_name', e.target.value)} placeholder="e.g. WhatsApp test" />
                </label>

                {(draft.channel_provider || 'whatsapp') === '360dialog' ? (
                  <>
                    <label>
                      360dialog API key
                      <div className="password-row">
                        <input value={draft.api_key || ''} onChange={(e) => update('api_key', e.target.value)} type={showKey ? 'text' : 'password'} placeholder="Your D360 sandbox API key" style={{ flex: 1, minWidth: 0 }} />
                        <button type="button" className="icon-button" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      </div>
                    </label>
                    <label>
                      Sandbox test WhatsApp number
                      <input
                        value={draft.default_to_phone || ''}
                        onChange={(e) => update('default_to_phone', e.target.value)}
                        placeholder="e.g. +923001234567"
                      />
                      <span className="config-note">Use the WhatsApp number linked to this sandbox API key, including country code. Do not start with 0.</span>
                    </label>
                    <label>
                      360dialog environment
                      <select value={draft.dialog_environment || 'sandbox'} onChange={(e) => update('dialog_environment', e.target.value)}>
                        <option value="sandbox">Developer Sandbox (up to 200 test messages)</option>
                        <option value="production">Production / WABA</option>
                      </select>
                    </label>
                    <div className="config-note" style={{ borderLeft: '3px solid #16a34a', background: '#f0fdf4', color: '#065f46' }}>
                      For Sandbox, configure 360dialog's webhook URL as <code>https://YOUR-DOMAIN/webhooks/360dialog/whatsapp</code>. Your API key is sent in the <code>D360-API-KEY</code> header.
                    </div>
                  </>
                ) : (
                  <>
                    <label>
                      Meta access token
                      <div className="password-row">
                        <input value={draft.api_key || ''} onChange={(e) => update('api_key', e.target.value)} type={showKey ? 'text' : 'password'} style={{ flex: 1, minWidth: 0 }} />
                        <button type="button" className="icon-button" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      </div>
                    </label>
                    <label>
                      Phone number ID
                      <input value={draft.phone_number_id || ''} onChange={(e) => update('phone_number_id', e.target.value)} placeholder="Meta phone_number_id" />
                    </label>
                    <label>
                      Verify token <span className="config-note">(for Meta webhook)</span>
                      <input value={draft.verify_token || ''} onChange={(e) => update('verify_token', e.target.value)} />
                    </label>
                  </>
                )}

                <label>
                  Flow to run for incoming replies
                  <select value={draft.flow_id_for_replies || ''} onChange={(e) => update('flow_id_for_replies', e.target.value)}>
                    <option value="">Don't auto-reply (send only)</option>
                    <option value={flowId || ''}>{flowId ? `This flow (${flowId})` : 'This flow'}</option>
                  </select>
                </label>
              </>
            )}

            {credentialError && (
              <div className="config-note" style={{ color: '#b91c1c', background: '#fef2f2' }}>{credentialError}</div>
            )}

            <div className="config-note" style={{ borderLeft: '3px solid #10b981', background: '#f0fdf4', color: '#065f46' }}>
              ✓ Secrets are stored in the backend credential store; the workflow saves only the credential ID.
            </div>
          </>
        )}

        {/* ================================================
            DATA SOURCE NODE
            ================================================ */}

        {node.type === 'data_source' && (
          <>
            <div className="ai-callout">
              <div className="ai-callout-header">
                <Info size={13} />
                <span>Database / data step</span>
              </div>
              <p>
                Use <strong>Simple</strong> mode for common actions, or switch to <strong>Write SQL</strong>
                when you want full control. Workflow values can be used as <code>{'{{variable}}'}</code>.
              </p>
            </div>

            <label>
              Source
              <select
                value={draft.source_type || 'postgresql'}
                onChange={(e) => {
                  const source_type = e.target.value as any
                  setDraft((current) => ({
                    ...current,
                    source_type,
                    query_mode: (source_type === 'rest_api' || source_type === 'csv') ? 'simple' : current.query_mode,
                    operation: (source_type === 'rest_api' || source_type === 'csv') ? 'fetch' : current.operation,
                    credential_id: '',
                    credential_name: '',
                  }))
                  setCreatingCredential(false)
                  setTestResult(null)
                  setTestError('')
                }}
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="rest_api">REST API</option>
                <option value="csv">CSV file</option>
              </select>
            </label>

            {draft.source_type !== 'csv' && (
              <label>
                Credential
                <select
                  value={creatingCredential ? '__new__' : (draft.credential_id || '')}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setCreatingCredential(true)
                      setDraft((current) => ({ ...current, credential_id: '', credential_name: '' }))
                    } else {
                      setCreatingCredential(false)
                      const selected = credentials.find((credential) => credential.id === e.target.value)
                      setDraft((current) => ({
                        ...current,
                        credential_id: e.target.value,
                        credential_name: selected?.name || '',
                      }))
                    }
                    setCredentialError('')
                  }}
                  disabled={credentialLoading}
                >
                  <option value="">{credentialLoading ? 'Loading credentials…' : 'Select credential'}</option>
                  {credentials
                    .filter((c) => c.provider === (draft.source_type || 'postgresql'))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new__">+ Add new credential…</option>
                </select>
              </label>
            )}

            {creatingCredential && draft.source_type !== 'csv' && draft.source_type !== 'rest_api' && (
              <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <strong style={{ fontSize: 13 }}>New database credential</strong>
                <input
                  value={draft.credential_name || ''}
                  onChange={(e) => update('credential_name', e.target.value)}
                  placeholder="Credential name"
                />
                <div className="option-row">
                  <input value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="Host" />
                  <input
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    placeholder={draft.source_type === 'mysql' ? '3306' : '5432'}
                  />
                </div>
                <input value={dbDatabase} onChange={(e) => setDbDatabase(e.target.value)} placeholder="Database" />
                <div className="option-row">
                  <input value={dbUsername} onChange={(e) => setDbUsername(e.target.value)} placeholder="Username" />
                  <div className="password-row" style={{ flex: 1 }}>
                    <input
                      value={dbPassword}
                      onChange={(e) => setDbPassword(e.target.value)}
                      placeholder="Password"
                      type={showKey ? 'text' : 'password'}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <button type="button" className="icon-button" onClick={() => setShowKey((v) => !v)}>
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {creatingCredential && draft.source_type === 'rest_api' && (
              <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <strong style={{ fontSize: 13 }}>New REST credential</strong>
                <input
                  value={draft.credential_name || ''}
                  onChange={(e) => update('credential_name', e.target.value)}
                  placeholder="Credential name"
                />
                <input value={restBaseUrl} onChange={(e) => setRestBaseUrl(e.target.value)} placeholder="https://api.example.com" />
                <input value={restApiKey} onChange={(e) => setRestApiKey(e.target.value)} placeholder="API key (optional)" type={showKey ? 'text' : 'password'} />
                <input value={restAuthHeader} onChange={(e) => setRestAuthHeader(e.target.value)} placeholder="Authorization" />
              </div>
            )}

            {credentialError && (
              <div className="config-note" style={{ color: '#b91c1c', background: '#fef2f2' }}>{credentialError}</div>
            )}

            {(draft.source_type === 'postgresql' || draft.source_type === 'mysql') && (
              <>
                <label>
                  Operation
                  <select
                    value={draft.operation || 'fetch'}
                    onChange={(e) => {
                      const operation = e.target.value as any
                      setDraft((current) => ({ ...current, operation }))
                      setTestResult(null)
                      setTestError('')
                    }}
                  >
                    <option value="fetch">Fetch records</option>
                    <option value="insert">Insert record</option>
                    <option value="update">Update records</option>
                    <option value="delete">Delete records</option>
                  </select>
                </label>

                <label>
                  How do you want to configure it?
                  <select
                    value={draft.query_mode || 'simple'}
                    onChange={(e) => {
                      const query_mode = e.target.value as 'simple' | 'sql'
                      setDraft((current) => ({ ...current, query_mode }))
                      setTestResult(null)
                      setTestError('')
                    }}
                  >
                    <option value="simple">Simple — fill in fields</option>
                    <option value="sql">Write SQL query</option>
                  </select>
                </label>

                {(draft.query_mode || 'simple') === 'sql' ? (
                  <label>
                    SQL query
                    <textarea
                      value={draft.query || ''}
                      onChange={(e) => update('query', e.target.value)}
                      rows={7}
                      spellCheck={false}
                      placeholder={
                        (draft.operation || 'fetch') === 'fetch'
                          ? 'SELECT * FROM patients WHERE patient_id = {{patient_id}}'
                          : (draft.operation || 'fetch') === 'update'
                            ? 'UPDATE patients\nSET contact_number = {{contact_number}}\nWHERE patient_id = {{patient_id}}'
                            : (draft.operation || 'fetch') === 'insert'
                              ? 'INSERT INTO patients (name, contact_number)\nVALUES ({{name}}, {{contact_number}})'
                              : 'DELETE FROM patients\nWHERE patient_id = {{patient_id}}'
                      }
                    />
                    <span className="config-note" style={{ marginTop: 5 }}>
                      Variables such as <code>{'{{patient_id}}'}</code> are passed as bound SQL parameters, not pasted into the query.
                      Only one statement is allowed. Update/Delete must contain a WHERE clause.
                    </span>
                  </label>
                ) : (
                  <>
                    <label>
                      Table
                      <input
                        value={draft.table || ''}
                        onChange={(e) => update('table', e.target.value)}
                        placeholder="patients"
                      />
                    </label>

                    {((draft.operation || 'fetch') === 'insert' || (draft.operation || 'fetch') === 'update') && (
                      <label>
                        {(draft.operation || 'fetch') === 'insert' ? 'Values to insert' : 'Values to update'}
                        <div className="option-list">
                          {Object.entries(draft.values || {}).map(([key, value], index) => (
                            <div className="option-row" key={`${key}-${index}`}>
                              <input
                                value={key}
                                placeholder="Column"
                                onChange={(e) => {
                                  const entries = Object.entries(draft.values || {})
                                  entries[index] = [e.target.value, value]
                                  update('values', Object.fromEntries(entries))
                                }}
                              />
                              <input
                                value={value}
                                placeholder="{{variable}} or value"
                                onChange={(e) => {
                                  const entries = Object.entries(draft.values || {})
                                  entries[index] = [key, e.target.value]
                                  update('values', Object.fromEntries(entries))
                                }}
                              />
                              <button type="button" className="icon-button" onClick={() => {
                                const entries = Object.entries(draft.values || {})
                                entries.splice(index, 1)
                                update('values', Object.fromEntries(entries))
                              }}><Trash2 size={14} /></button>
                            </div>
                          ))}
                          <button type="button" className="secondary-button" onClick={() => {
                            const entries = Object.entries(draft.values || {})
                            entries.push(['', ''])
                            update('values', Object.fromEntries(entries))
                          }}><Plus size={14} /> Add value</button>
                        </div>
                      </label>
                    )}

                    {(draft.operation || 'fetch') !== 'insert' && (
                      <label>
                        {(draft.operation || 'fetch') === 'fetch' ? 'Filters (optional)' : 'WHERE filters'}
                        <div className="option-list">
                          {Object.entries(draft.filters || {}).map(([key, value], index) => (
                            <div className="option-row" key={`${key}-${index}`}>
                              <input
                                value={key}
                                placeholder="Column"
                                onChange={(e) => {
                                  const entries = Object.entries(draft.filters || {})
                                  entries[index] = [e.target.value, value]
                                  update('filters', Object.fromEntries(entries))
                                }}
                              />
                              <input
                                value={value}
                                placeholder="{{variable}} or value"
                                onChange={(e) => {
                                  const entries = Object.entries(draft.filters || {})
                                  entries[index] = [key, e.target.value]
                                  update('filters', Object.fromEntries(entries))
                                }}
                              />
                              <button type="button" className="icon-button" onClick={() => {
                                const entries = Object.entries(draft.filters || {})
                                entries.splice(index, 1)
                                update('filters', Object.fromEntries(entries))
                              }}><Trash2 size={14} /></button>
                            </div>
                          ))}
                          <button type="button" className="secondary-button" onClick={() => {
                            const entries = Object.entries(draft.filters || {})
                            entries.push(['', ''])
                            update('filters', Object.fromEntries(entries))
                          }}><Plus size={14} /> Add filter</button>
                        </div>
                        {['update', 'delete'].includes(draft.operation || 'fetch') && (
                          <span className="config-note" style={{ marginTop: 4 }}>Required for safety.</span>
                        )}
                      </label>
                    )}
                  </>
                )}
              </>
            )}

            {(draft.source_type === 'rest_api') && (
              <label>
                Endpoint
                <input value={draft.endpoint || ''} onChange={(e) => update('endpoint', e.target.value)} placeholder="/appointments" />
              </label>
            )}

            {(draft.source_type === 'csv') && (
              <label>
                CSV file name
                <input value={draft.file_name || ''} onChange={(e) => update('file_name', e.target.value)} placeholder="appointments.csv" />
              </label>
            )}

            {(draft.operation || 'fetch') === 'fetch' && (draft.query_mode || 'simple') === 'simple' && (
              <label>
                Maximum rows
                <input type="number" min={1} value={draft.limit ?? 50} onChange={(e) => update('limit', Number(e.target.value) || undefined)} />
              </label>
            )}

            <label>
              Save output as
              <input value={draft.output_variable || 'records'} onChange={(e) => update('output_variable', e.target.value)} placeholder="records" />
            </label>

            <button type="button" className="secondary-button" onClick={runTest} disabled={testing}>
              {testing ? 'Testing…' : ((draft.operation || 'fetch') === 'fetch' ? 'Test step' : 'Test safely — rollback')}
            </button>

            {testError && (
              <div className="config-note" style={{ color: '#b91c1c', background: '#fef2f2' }}>{testError}</div>
            )}

            {testResult && (
              <div className="config-note" style={{ borderLeft: '3px solid #10b981', background: '#f0fdf4', color: '#065f46' }}>
                ✓ {(draft.operation || 'fetch') === 'fetch'
                  ? `Found ${testResult.count} record(s).`
                  : `Query is valid; ${testResult.count} row(s) would be affected. Nothing was committed.`}
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6, fontSize: 12 }}>{JSON.stringify(testResult.sample, null, 2)}</pre>
              </div>
            )}
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

        {node.type !== 'ai' && node.type !== 'data_source' && (
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
          onClick={() => {
            if (node.type === 'for_each') {
              onChange(initialConfigRef.current)
            }
            onClose()
          }}
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
