import type { Flow, FlowNode, FlowNodeConfig, FlowEdge, FlowStatus, NodeType } from '@/types/flow'

const API_URL = 'http://localhost:8000'

interface BackendNode {
  id: string
  type: string
  message?: string | null
  options?: Array<{ label?: string; value?: string; next_node?: string | null } | string> | null
  variable?: string | null
  condition?: string | null
  prompt?: string | null
  // AI API connection fields
  api_url?: string | null
  api_key?: string | null
  model?: string | null
  provider?: string | null
  credential_id?: string | null
  true_node?: string | null
  false_node?: string | null
  next_node?: string | null
  position?: { x: number; y: number }
  config?: Partial<FlowNodeConfig>
}


interface BackendFlowResponse {
  flow_id: string
  name?: string
  description?: string
  status?: FlowStatus
  nodes?: BackendNode[]
  edges?: FlowEdge[]
  updatedAt?: string
}

function normalizeBackendFlow(raw: BackendFlowResponse): Flow {
  const nodes = raw.nodes || []
  const existingEdges = raw.edges || []
  const derivedEdges: FlowEdge[] = [...existingEdges]

  const frontendNodes: FlowNode[] = nodes.map((node, i) => {
    // Derive edges from backend node properties if explicit edges are not present
    if (existingEdges.length === 0) {
      if (node.next_node) {
        derivedEdges.push({
          id: `e-${node.id}-${node.next_node}`,
          source: node.id,
          target: node.next_node,
        })
      }
      if (node.true_node) {
        derivedEdges.push({
          id: `e-${node.id}-${node.true_node}-true`,
          source: node.id,
          target: node.true_node,
          label: 'True',
        })
      }
      if (node.false_node) {
        derivedEdges.push({
          id: `e-${node.id}-${node.false_node}-false`,
          source: node.id,
          target: node.false_node,
          label: 'False',
        })
      }
      if (Array.isArray(node.options)) {
        node.options.forEach((opt, optIdx) => {
          if (typeof opt === 'object' && opt && opt.next_node) {
            derivedEdges.push({
              id: `e-${node.id}-${opt.next_node}-${optIdx}`,
              source: node.id,
              target: opt.next_node,
              label: opt.label || opt.value || `Option ${optIdx + 1}`,
            })
          }
        })
      }
    }

    const type = (node.type as NodeType) || 'message'
    const config: Partial<FlowNodeConfig> = node.config || {}

    return {
      id: node.id,
      type,
      position: node.position || {
        x: 80 + (i % 3) * 320,
        y: 80 + Math.floor(i / 3) * 220,
      },
      config: {
        label: config.label || node.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        text: node.message ?? config.text ?? '',
        options: Array.isArray(node.options)
          ? node.options.map((o) => (typeof o === 'string' ? o : o.label || o.value || ''))
          : config.options || [],
        variable: node.variable ?? config.variable ?? '',
        condition: node.condition ?? config.condition ?? '',
        prompt: node.prompt ?? config.prompt ?? '',
        // Preserve AI API connection fields if backend returns them
        api_url: node.api_url ?? config.api_url ?? (
          type === 'ai' ? '' : ''
        ),
        // Never expose stored secrets to the browser. Legacy api_key values are migrated server-side.
        api_key: '',
        model: node.model ?? config.model ?? (
          type === 'ai' ? 'gpt-4o-mini' : ''
        ),
        provider: node.provider ?? config.provider ?? (
          type === 'ai' ? 'openai' : ''
        ),
        credential_id: (node as any).credential_id ?? (config as any).credential_id ?? '',
      },
    }
  })

  return {
    flow_id: raw.flow_id,
    name: raw.name || raw.flow_id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: raw.description || 'Automated conversation flow loaded from backend.',
    status: raw.status === 'draft' ? 'draft' : 'active',
    nodes: frontendNodes,
    edges: derivedEdges,
    updatedAt: raw.updatedAt || 'just now',
  }
}

function flowToBackendPayload(flow: Flow) {
  const nodes = flow.nodes.map((node) => {
    const outgoing = (flow.edges || []).filter((e) => e.source === node.id)
    const backendNode: BackendNode = {
      id: node.id,
      type: node.type,
      position: node.position,
      config: node.config,
    }

    if (node.type === 'start') {
      backendNode.next_node = outgoing[0]?.target || null
    } else if (node.type === 'message') {
      backendNode.message = node.config?.text || null
      backendNode.next_node = outgoing[0]?.target || null
    } else if (node.type === 'buttons') {
      backendNode.message = node.config?.text || node.config?.label || null
      const options = node.config?.options || []
      backendNode.options = options.map((opt, idx) => {
        const edge = outgoing.find((e) => e.label === opt) || outgoing[idx]
        return {
          label: opt,
          value: opt.toLowerCase().replace(/\s+/g, '_'),
          next_node: edge?.target || null,
        }
      })
      backendNode.next_node = null
    } else if (node.type === 'input') {
      backendNode.message = node.config?.text || null
      backendNode.variable = node.config?.variable || null
      backendNode.next_node = outgoing[0]?.target || null
    } else if (node.type === 'condition') {
      backendNode.condition = node.config?.condition || null
      const trueEdge = outgoing.find((e) => e.label?.toLowerCase() === 'true') || outgoing[0]
      const falseEdge = outgoing.find((e) => e.label?.toLowerCase() === 'false') || outgoing[1]
      backendNode.true_node = trueEdge?.target || null
      backendNode.false_node = falseEdge?.target || null
      backendNode.next_node = null
    } else if (node.type === 'ai') {
      backendNode.message = node.config?.prompt || node.config?.text || null
      backendNode.prompt = node.config?.prompt || null
      backendNode.next_node = outgoing[0]?.target || null
      // Forward AI API connection fields. The backend can also use
      // OPENAI_API_KEY / AI_API_KEY from its environment, so an API key
      // does not have to be stored in the flow JSON.
      ;(backendNode as any).api_url =
        node.config?.api_url || undefined
      ;(backendNode as any).credential_id =
        node.config?.credential_id || undefined
      ;(backendNode as any).model =
        node.config?.model || 'gpt-4o-mini'
      ;(backendNode as any).provider =
        node.config?.provider || 'openai'
      // API keys are transient and must never be written into flow JSON.
      ;(backendNode as any).api_key = undefined
    } else if (node.type === 'end') {
      backendNode.message = node.config?.text || null
      backendNode.next_node = null
    }

    return backendNode
  })

  return {
    flow_id: flow.flow_id,
    nodes,
  }
}

export const flowApi = {
  // Get all flows
  list: async (): Promise<Flow[]> => {
    const response = await fetch(`${API_URL}/flows`)

    if (!response.ok) {
      throw new Error('Failed to fetch flows')
    }

    const data = await response.json()
    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] === 'string') {
        const flows = await Promise.all(
          (data as string[]).map(async (id) => {
            const flow = await flowApi.get(id)
            return (
              flow ?? {
                flow_id: id,
                name: id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                description: '',
                status: 'draft' as FlowStatus,
                nodes: [],
                edges: [],
                updatedAt: 'just now',
              }
            )
          })
        )
        return flows
      }
      return (data as BackendFlowResponse[]).map(normalizeBackendFlow)
    }

    return []
  },

  // Get one flow
  get: async (id: string): Promise<Flow | undefined> => {
    const response = await fetch(`${API_URL}/flows/${id}`)

    if (response.status === 404) {
      return undefined
    }

    if (!response.ok) {
      throw new Error('Failed to fetch flow')
    }

    const data: BackendFlowResponse = await response.json()
    return normalizeBackendFlow(data)
  },

  // Create/save a flow
  save: async (flow: Flow): Promise<Flow> => {
    const payload = flowToBackendPayload(flow)
    const response = await fetch(`${API_URL}/flows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('Failed to save flow')
    }

    return {
      ...flow,
      updatedAt: 'just now',
    }
  },
  // Rename flow
  rename: async (
    id: string,
    name: string
  ): Promise<Flow> => {
    const response = await fetch(
      `${API_URL}/flows/${encodeURIComponent(id)}/rename`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)

      throw new Error(
        errorData?.detail || 'Failed to rename flow'
      )
    }

    const data: BackendFlowResponse =
      await response.json()

    return normalizeBackendFlow(data)
  },

  // Delete flow
  delete: async (
    id: string
  ): Promise<void> => {
    const response = await fetch(
      `${API_URL}/flows/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)

      throw new Error(
        errorData?.detail || 'Failed to delete flow'
      )
    }
  },
}

export interface CredentialSummary {
  id: string
  name: string
  provider: string
  created_at?: string
  updated_at?: string
  has_api_key?: boolean
}

export const credentialsApi = {
  list: async (): Promise<CredentialSummary[]> => {
    const response = await fetch(`${API_URL}/credentials`)
    if (!response.ok) throw new Error('Failed to fetch credentials')
    return response.json()
  },

  create: async (data: { name: string; provider: string; api_key: string; api_url?: string }): Promise<CredentialSummary> => {
    const response = await fetch(`${API_URL}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.detail || 'Failed to create credential')
    return payload
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_URL}/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Failed to delete credential')
  },
}


// Chat API

export interface ChatRequest {
  conversation_id: string
  flow_id: string
  message: string
}

export interface ChatResponse {
  conversation_id: string
  response: string
  current_node?: string | null
  status: string
  variables: Record<string, any>
  waiting_for_input?: boolean
  input_prompt?: string | null
  finished?: boolean
}

export const chatApi = {
  sendMessage: async (data: ChatRequest): Promise<ChatResponse> => {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error('Failed to send message')
    }

    return response.json()
  },
}
