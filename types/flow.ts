// ============================================================
// FLOW TYPES
// ============================================================
export type FlowStatus = 'active' | 'draft'

export type NodeType =
  | 'start'
  | 'message'
  | 'buttons'
  | 'input'
  | 'condition'
  | 'switch'
  | 'ai'
  | 'data_source'
  | 'for_each'
  | 'whatsapp'
  | 'end'


// ============================================================
// DATA SOURCE TYPES
// ============================================================

export type DataSourceType = 'postgresql' | 'mysql' | 'rest_api' | 'csv'
export type DataOperation = 'fetch' | 'insert' | 'update' | 'delete'


// ============================================================
// NODE CONFIGURATION
// ============================================================

export type FlowNodeConfig = {
  label: string

  // Message / input
  text?: string

  // Buttons
  options?: string[]

  // Input
  variable?: string

  // Condition
  condition?: string

  // Switch
  cases?: { label: string; value: string; next_node?: string }[]
  default_next_node?: string

  // Error handling
  error_next_node?: string

  // AI — prompt is the system/user instructions
  prompt?: string

  // AI — API connection fields (read by the backend executor)
  api_url?: string
  /** Legacy/transient only. Never persisted to workflow JSON. */
  api_key?: string
  model?: string
  provider?: string
  credential_id?: string
  credential_name?: string

  // Data Source / Database operation
  operation?: DataOperation
  /** Simple form builder or direct SQL editor for PostgreSQL/MySQL. */
  query_mode?: 'simple' | 'sql'
  source_type?: DataSourceType
  table?: string
  query?: string
  endpoint?: string
  base_url?: string
  file_name?: string
  filters?: Record<string, string>
  /** Column/value pairs used by Insert and Update. Values may contain {{variables}}. */
  values?: Record<string, string>
  limit?: number
  output_variable?: string
  /** Transient only, used to build a credential inline. Never persisted. */
  db_host?: string
  db_port?: string
  db_database?: string
  db_username?: string
  db_password?: string

  // For Each — loop bookkeeping
  input_variable?: string
  item_variable?: string
  index_variable?: string

  // WhatsApp — recipient + message are templated, e.g. {{current_item.phone}}
  channel_provider?: 'whatsapp' | '360dialog'
  to?: string
  message?: string
  /** Transient only, used to build a WhatsApp credential inline. Never persisted. */
  phone_number_id?: string
  verify_token?: string
  flow_id_for_replies?: string
  dialog_environment?: 'sandbox' | 'production'
  /** Default 360dialog sandbox recipient, stored in the credential. */
  default_to_phone?: string
}


// ============================================================
// FLOW NODE
// ============================================================

export type FlowNode = {
  id: string

  type: NodeType

  position: {
    x: number
    y: number
  }

  config: FlowNodeConfig
}


// ============================================================
// FLOW EDGE
// ============================================================

export type FlowEdge = {
  id: string
  source: string
  target: string
  label?: string
  sourceHandle?: 'each' | 'done' | 'next'
}


// ============================================================
// FLOW
// ============================================================
//
// This represents the actual flow returned by FastAPI.
//
// IMPORTANT:
// This type does NOT contain a default/demo flow.
// Actual flows come from:
//
// GET  /flows
// GET  /flows/{flow_id}
// POST /flows
//

export type Flow = {
  flow_id: string
  name: string
  description: string
  status: FlowStatus
  nodes: FlowNode[]
  edges: FlowEdge[]

  // Backend may provide this.
  // Optional because your current FastAPI FlowConfig
  // may not necessarily return it.
  updatedAt?: string
}


// ============================================================
// NODE METADATA
// ============================================================
//
// Static UI information is okay to keep here.
// This is NOT business/application data.
//

export const NODE_META: Record<
  NodeType,
  {
    label: string
    description: string
    tone: string
  }
> = {
  start: {
    label: 'Start',
    description: 'Entry point',
    tone: 'violet',
  },

  message: {
    label: 'Message',
    description: 'Send a message',
    tone: 'blue',
  },

  buttons: {
    label: 'Buttons',
    description: 'Quick replies',
    tone: 'teal',
  },

  input: {
    label: 'Input',
    description: 'Collect a reply',
    tone: 'amber',
  },

  condition: {
    label: 'Condition',
    description: 'Branch the flow',
    tone: 'orange',
  },

  switch: {
    label: 'Switch',
    description: 'Route by value',
    tone: 'indigo',
  },

  ai: {
    label: 'AI Response',
    description: 'Generate a reply',
    tone: 'pink',
  },

  data_source: {
    label: 'Data Source',
    description: 'Fetch, insert, update, or delete data',
    tone: 'emerald',
  },

  for_each: {
    label: 'For Each',
    description: 'Iterate over a list',
    tone: 'indigo',
  },

  whatsapp: {
    label: 'WhatsApp',
    description: 'Send a WhatsApp message',
    tone: 'green',
  },

  end: {
    label: 'End',
    description: 'Finish flow',
    tone: 'slate',
  },
}


// ============================================================
// NODE TYPES
// ============================================================

export const nodeTypeList = Object.keys(
  NODE_META
) as NodeType[]

export const flowTypes = [
  'start',
  'message',
  'buttons',
  'input',
  'condition',
  'switch',
  'ai',
  'data_source',
  'for_each',
  'whatsapp',
  'end',
] as const

export const supportedNodeTypes = flowTypes

export const allNodeTypes = nodeTypeList

export const visibleNodeTypes = nodeTypeList.filter(
  (type) => type !== 'start'
)


// ============================================================
// NODE CREATION
// ============================================================

export function createNode(
  type: NodeType,
  index: number
): FlowNode {
  const defaults: Record<NodeType, FlowNodeConfig> = {
    start: {
      label: 'New trigger',
    },

    message: {
      label: 'New message',
      text: '',
    },

    buttons: {
      label: 'Choose an option',
      options: ['Option one', 'Option two'],
    },

    input: {
      label: 'Collect information',
      text: '',
      variable: 'answer',
    },

    condition: {
      label: 'Check a condition',
      condition: '',
    },

    switch: {
      label: 'Route by value',
      variable: '',
      cases: [],
    },

    ai: {
      label: 'AI response',
      prompt: '',
      // Backend also supports environment-level AI settings, so these
      // fields can be left blank when OPENAI_API_KEY is configured.
      api_url: '',
      api_key: '',
      model: 'gpt-4o-mini',
      provider: 'openai',
    },

    data_source: {
      label: 'Database operation',
      operation: 'fetch',
      source_type: 'postgresql',
      table: '',
      filters: {},
      values: {},
      limit: 50,
      output_variable: 'records',
    },

    for_each: {
      label: 'For Each item',
      input_variable: 'records',
      item_variable: 'current_item',
      index_variable: 'index',
    },

    whatsapp: {
      label: 'Send WhatsApp message',
      to: '',
      message: '',
      channel_provider: '360dialog',
      dialog_environment: 'sandbox',
      credential_id: '',
    },

    end: {
      label: 'End conversation',
    },
  }

  return {
    id: `${type}-${Date.now()}-${index}`,

    type,

    position: {
      x: 260 + (index % 3) * 300,
      y: 100 + Math.floor(index / 3) * 190,
    },

    config: {
      ...defaults[type],
    },
  }
}


// ============================================================
// EMPTY FLOW
// ============================================================
//
// Used when the user clicks "Create Flow".
// This does NOT represent real backend data.
//

export const emptyFlow = (): Flow => ({
  flow_id: `flow-${Date.now()}`,
  name: 'Untitled flow',
  description: '',
  status: 'draft',
  nodes: [],
  edges: [],
})


// ============================================================
// SERIALIZATION
// ============================================================
//
// Your FastAPI POST /flows accepts FlowConfig.
// These helpers prepare the frontend object for the API.
//

export type SerializedFlow = Omit<Flow, 'updatedAt'>

export const serializeFlow = (
  flow: Flow
): SerializedFlow => ({
  flow_id: flow.flow_id,
  name: flow.name,
  description: flow.description,
  status: flow.status,
  nodes: flow.nodes,
  edges: flow.edges,
})

export const serializeForApi = serializeFlow

export const buildPayload = serializeFlow

export const flowToJson = (
  flow: Flow
): string =>
  JSON.stringify(
    serializeFlow(flow),
    null,
    2
  )

export const serializePretty = flowToJson

export const fromJson = (
  json: string
): Flow => {
  return JSON.parse(json) as Flow
}

export const parseFlow = fromJson

export const deserializeFlow = (
  flow: SerializedFlow
): Flow => ({
  ...flow,
})

export const deserializeFromApi = deserializeFlow

export const parsePayload = deserializeFromApi


// ============================================================
// FLOW NORMALIZATION
// ============================================================

export function normalizeFlow(
  flow: Flow
): Flow {
  return {
    ...flow,

    nodes: flow.nodes.map((node) => ({
      ...node,
      config: {
        ...node.config,
      },
    })),

    edges: flow.edges.map((edge) => ({
      ...edge,
    })),
  }
}


// ============================================================
// FLOW CLONING / DUPLICATION
// ============================================================

export const cloneFlow = (
  flow: Flow
): Flow =>
  JSON.parse(
    JSON.stringify(flow)
  ) as Flow


export function duplicateFlow(
  flow: Flow
): Flow {
  return {
    ...cloneFlow(flow),

    flow_id: `${flow.flow_id}-copy-${Date.now()}`,

    name: `${flow.name} copy`,

    status: 'draft',

    updatedAt: undefined,
  }
}


// ============================================================
// NODE HELPERS
// ============================================================

export const getNode = (
  flow: Flow,
  id: string
): FlowNode | undefined =>
  flow.nodes.find(
    (node) => node.id === id
  )


export const flowNode = getNode

export const selectedNode = getNode


export const getOutgoing = (
  flow: Flow,
  id: string
): FlowEdge[] =>
  flow.edges.filter(
    (edge) => edge.source === id
  )


export const getIncoming = (
  flow: Flow,
  id: string
): FlowEdge[] =>
  flow.edges.filter(
    (edge) => edge.target === id
  )


export const getOutgoingEdges = getOutgoing

export const getIncomingEdges = getIncoming


// ============================================================
// NODE UPDATES
// ============================================================

export const updateNodeConfig = (
  flow: Flow,
  id: string,
  config: Partial<FlowNodeConfig>
): Flow => ({
  ...flow,

  nodes: flow.nodes.map(
    (node) =>
      node.id === id
        ? {
          ...node,

          config: {
            ...node.config,
            ...config,
          },
        }
        : node
  ),
})


export const updateFlowNode =
  updateNodeConfig


export const updateNodePosition = (
  flow: Flow,
  id: string,
  position: {
    x: number
    y: number
  }
): Flow => ({
  ...flow,

  nodes: flow.nodes.map(
    (node) =>
      node.id === id
        ? {
          ...node,
          position,
        }
        : node
  ),
})


export const moveFlowNode =
  updateNodePosition


// ============================================================
// NODE REMOVAL / ADDITION
// ============================================================

export const removeNode = (
  flow: Flow,
  id: string
): Flow => ({
  ...flow,

  nodes: flow.nodes.filter(
    (node) => node.id !== id
  ),

  edges: flow.edges.filter(
    (edge) =>
      edge.source !== id &&
      edge.target !== id
  ),
})


export const removeFlowNode =
  removeNode


export const addFlowNode = (
  flow: Flow,
  node: FlowNode
): Flow => ({
  ...flow,

  nodes: [
    ...flow.nodes,
    node,
  ],
})


export const insertFlowNode =
  addFlowNode


export const addFlowEdge = (
  flow: Flow,
  edge: FlowEdge
): Flow => ({
  ...flow,

  edges: [
    ...flow.edges,
    edge,
  ],
})


export const connectFlowNodes =
  addFlowEdge


// ============================================================
// EDGE HELPERS
// ============================================================

export function edgeBetween(
  source: string,
  target: string,
  label?: string
): FlowEdge {
  return {
    id: `e-${source}-${target}-${Date.now()}`,
    source,
    target,
    label,
  }
}


export const makeConnection =
  edgeBetween


export const makeEdgeId = (
  source: string,
  target: string
): string =>
  `edge:${source}:${target}`


export const connectionLabel = (
  edge: FlowEdge
): string =>
  edge.label || 'Next'


export const uniqueEdges = (
  edges: FlowEdge[]
): FlowEdge[] =>
  edges.filter(
    (edge, index) =>
      edges.findIndex(
        (candidate) =>
          candidate.source === edge.source &&
          candidate.target === edge.target
      ) === index
  )


export const uniqueNodes = (
  nodes: FlowNode[]
): FlowNode[] =>
  nodes.filter(
    (node, index) =>
      nodes.findIndex(
        (candidate) =>
          candidate.id === node.id
      ) === index
  )


export const cleanFlow = (
  flow: Flow
): Flow => ({
  ...flow,

  nodes: uniqueNodes(flow.nodes),

  edges: uniqueEdges(flow.edges),
})


// ============================================================
// NODE LABEL / PREVIEW
// ============================================================

export const nodeLabel = (
  node: FlowNode
): string =>
  node.config.label ||
  NODE_META[node.type].label


export const nodePreview = (
  node: FlowNode
): string =>
  node.config.text ||
  node.config.prompt ||
  node.config.condition ||
  node.config.options?.join(' · ') ||
  NODE_META[node.type].description


export const nodePreviewText =
  nodePreview


export const nodeDisplayName =
  nodeLabel


export const nodeTypeLabel = (
  type: NodeType
): string =>
  NODE_META[type].label


export const nodeTypeDescription = (
  type: NodeType
): string =>
  NODE_META[type].description


export const nodeTone = (
  type: NodeType
): string =>
  NODE_META[type].tone


export const nodeTypeOptions =
  flowTypes.map((value) => ({
    value,
    ...NODE_META[value],
  }))


// ============================================================
// NODE CONFIG HELPERS
// ============================================================

export const defaultNodeConfig = (
  type: NodeType
): FlowNodeConfig =>
  createNode(type, 0).config


export const flowNodeDefaults =
  defaultNodeConfig


export const nodeConfig =
  defaultNodeConfig


export const supportsBranching = (
  type: NodeType
): boolean =>
  type === 'buttons' ||
  type === 'condition'


export const supportsText = (
  type: NodeType
): boolean =>
  ['message', 'input', 'ai'].includes(type)


export const supportsOptions = (
  type: NodeType
): boolean =>
  type === 'buttons'


export const supportsCondition = (
  type: NodeType
): boolean =>
  type === 'condition'


export const supportsPrompt = (
  type: NodeType
): boolean =>
  type === 'ai'


export const supportsVariable = (
  type: NodeType
): boolean =>
  type === 'input'


export const isTrigger = (
  type: NodeType
): boolean =>
  type === 'start'


export const isEnd = (
  type: NodeType
): boolean =>
  type === 'end'


export const isTerminal = (
  type: NodeType
): boolean =>
  type === 'end'


export const nodeTypeFromId = (
  id: string
): NodeType => {
  const type = id.split('-')[0]

  if (
    supportedNodeTypes.includes(
      type as NodeType
    )
  ) {
    return type as NodeType
  }

  return 'message'
}


// ============================================================
// FLOW VALIDATION
// ============================================================

export const isValidFlow = (
  flow: Flow
): boolean =>
  flow.nodes.length > 0 &&
  flow.nodes.some(
    (node) => node.type === 'start'
  )


export const isFlowComplete = (
  flow: Flow
): boolean =>
  flow.nodes.some(
    (node) => node.type === 'start'
  ) &&
  flow.nodes.some(
    (node) => node.type === 'end'
  )


export const flowHasStart = (
  flow: Flow
): boolean =>
  flow.nodes.some(
    (node) => node.type === 'start'
  )


export const flowHasEnd = (
  flow: Flow
): boolean =>
  flow.nodes.some(
    (node) => node.type === 'end'
  )


export const flowHasNodes = (
  flow: Flow
): boolean =>
  flow.nodes.length > 0


export const flowHasEdges = (
  flow: Flow
): boolean =>
  flow.edges.length > 0


export const canActivate = isValidFlow

export const isReadyToSave =
  isValidFlow

export const validFlow =
  isValidFlow

export const flowIsReady =
  isFlowComplete


// ============================================================
// FLOW STATUS
// ============================================================

export const statusLabel = (
  status: FlowStatus
): string =>
  status === 'active'
    ? 'Active'
    : 'Draft'


export const statusText =
  statusLabel


export const statusLabels = {
  active: 'Active',
  draft: 'Draft',
}


export const statusColor = (
  status: FlowStatus
): string =>
  status === 'active'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-slate-100 text-slate-600'


export const statusTone = (
  status: FlowStatus
): string =>
  status === 'active'
    ? 'success'
    : 'neutral'


export const setFlowStatus = (
  flow: Flow,
  status: FlowStatus
): Flow => ({
  ...flow,
  status,
})


export const activate = (
  flow: Flow
): Flow =>
  setFlowStatus(flow, 'active')


export const deactivate = (
  flow: Flow
): Flow =>
  setFlowStatus(flow, 'draft')


export const isDraft = (
  flow: Flow
): boolean =>
  flow.status === 'draft'


export const isActive = (
  flow: Flow
): boolean =>
  flow.status === 'active'


// ============================================================
// FLOW NAME / DESCRIPTION
// ============================================================

export const safeFlowName = (
  name: string
): string =>
  name.trim() || 'Untitled flow'


export const setFlowName = (
  flow: Flow,
  name: string
): Flow => ({
  ...flow,
  name: safeFlowName(name),
})


export const setFlowDescription = (
  flow: Flow,
  description: string
): Flow => ({
  ...flow,
  description,
})


export const flowName = (
  flow: Flow
): string =>
  flow.name


export const flowTitle = (
  flow: Flow
): string =>
  flow.name || 'Untitled flow'


export const flowDisplayName =
  flowTitle


export const flowDescription = (
  flow: Flow
): string =>
  flow.description || 'No description yet.'


export const flowSubtitle = (
  flow: Flow
): string =>
  flow.description || 'No description'


export const flowCardDescription = (
  flow: Flow
): string =>
  flow.description ||
  'Build an automated conversation with the visual editor.'


// ============================================================
// FLOW STATISTICS
// ============================================================

export const countActiveFlows = (
  flows: Flow[]
): number =>
  flows.filter(
    (flow) => flow.status === 'active'
  ).length


export const countNodes = (
  flow: Flow
): number =>
  flow.nodes.length


export const countEdges = (
  flow: Flow
): number =>
  flow.edges.length


export const nodeCount = (
  nodes: FlowNode[]
): number =>
  nodes.length


export const edgeCount = (
  edges: FlowEdge[]
): number =>
  edges.length


export const flowSummary = (
  flow: Flow
): string =>
  `${flow.nodes.length} nodes · ${flow.edges.length} connections`


export const getFlowSummary =
  flowSummary


export const flowStats = (
  flow: Flow
) => ({
  nodes: countNodes(flow),
  edges: countEdges(flow),
  status: flow.status,
})


export const flowMeta = (
  flow: Flow
) => ({
  name: flow.name,
  status: flow.status,
  nodes: flow.nodes.length,
})


// ============================================================
// FLOW SORTING / IDs
// ============================================================

export const sortFlows = (
  flows: Flow[]
): Flow[] =>
  [...flows].sort(
    (a, b) =>
      a.name.localeCompare(b.name)
  )


export const flowKey = (
  flow: Flow
): string =>
  flow.flow_id


export const flowId = (
  flow: Flow
): string =>
  flow.flow_id


export const getNextId = (
  flow: Flow
): string =>
  `node-${flow.nodes.length + 1}`


export const nextNodeId = (
  nodes: FlowNode[],
  type: NodeType
): string =>
  createNode(type, nodes.length).id


export const makeNodeId =
  nextNodeId


export const nodeKey = (
  node: FlowNode
): string =>
  `${node.type}:${node.id}`


// ============================================================
// NODE COUNTS / LABELS
// ============================================================

export const nodeCountLabel = (
  flow: Flow
): string =>
  `${flow.nodes.length} ${flow.nodes.length === 1
    ? 'node'
    : 'nodes'
  }`


export const formatNodeCount =
  nodeCountLabel


export const updatedLabel = (
  flow: Flow
): string =>
  flow.updatedAt
    ? `Updated ${flow.updatedAt}`
    : 'Not updated yet'


export const formatUpdatedAt =
  updatedLabel


export const activeStatusText = (
  flow: Flow
): string =>
  flow.status === 'active'
    ? 'Live'
    : 'Draft'


export const actionLabel = (
  flow: Flow
): string =>
  flow.status === 'active'
    ? 'Deactivate'
    : 'Activate'


// ============================================================
// UI HELPERS
// ============================================================

export const toneClasses: Record<
  string,
  string
> = {
  violet:
    'border-violet-200 bg-violet-50 text-violet-700',

  blue:
    'border-blue-200 bg-blue-50 text-blue-700',

  teal:
    'border-teal-200 bg-teal-50 text-teal-700',

  amber:
    'border-amber-200 bg-amber-50 text-amber-700',

  orange:
    'border-orange-200 bg-orange-50 text-orange-700',

  pink:
    'border-pink-200 bg-pink-50 text-pink-700',

  indigo:
    'border-indigo-200 bg-indigo-50 text-indigo-700',

  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-700',

  slate:
    'border-slate-200 bg-slate-50 text-slate-600',

  green:
    'border-green-200 bg-green-50 text-green-700',
}

export const nodeToneClasses: Record<NodeType, string> = {
  start:       toneClasses['violet'],
  message:     toneClasses['blue'],
  buttons:     toneClasses['teal'],
  input:       toneClasses['amber'],
  condition:   toneClasses['orange'],
  switch:      toneClasses['indigo'],
  ai:          toneClasses['pink'],
  data_source: toneClasses['emerald'],
  for_each:    toneClasses['indigo'],
  whatsapp:    toneClasses['green'],
  end:         toneClasses['slate'],
}


export const nodeIcons: Record<
  NodeType,
  string
> = {
  start: '⚡',
  message: '▤',
  buttons: '☷',
  input: '⌨',
  condition: '⑂',
  switch: '⇄',
  ai: '✦',
  data_source: '⛁',
  for_each: '↻',
  whatsapp: '☎',
  end: '◉',
}


export const nodeToneClass = (
  type: NodeType
): string =>
  toneClasses[
  NODE_META[type].tone
  ]


// ============================================================
// CONSTANTS
// ============================================================

export const appName = 'Flowcraft'

export const appVersion = '0.1.0'

export const flowVersion = 'v1'

export const schemaName =
  'flowcraft.flow.v1'

export const version = 1

export const nodeVersion = 1

export const edgeVersion = 1

export const jsonIndent = 2

export const flowNameMaxLength = 80

export const flowDescriptionMaxLength = 280

export const optionMaxLength = 50

export const maxFlowNodes = 100

export const maxNodes = maxFlowNodes

export const maxDescription =
  flowDescriptionMaxLength

export const maxName =
  flowNameMaxLength

export const maxOption =
  optionMaxLength


// ============================================================
// NAVIGATION
// ============================================================

export const navItems = [
  'Dashboard',
  'Flows',
  'Conversations',
  'Customers',
  'Automations',
  'Appointments',
  'Settings',
] as const

export type NavItem =
  typeof navItems[number]

export const appNav = navItems

export const appRoutes = navItems

export const allRoutes = navItems

export const defaultNav: NavItem =
  'Dashboard'


export const isNavItem = (
  value: string
): value is NavItem =>
  navItems.includes(
    value as NavItem
  )


// ============================================================
// BUILDER UI
// ============================================================

export const isBuilder = (
  view: string
): boolean =>
  view === 'Create Flow' ||
  view === 'Edit Flow'


export const builderViews = [
  'Create Flow',
  'Edit Flow',
] as const


export const builderCopy = {
  save: 'Save changes',
  preview: 'Preview JSON',
  add: 'Add a step',
}


export const nodeCopy = {
  message: 'Message',
  buttons: 'Buttons',
  input: 'Input',
  condition: 'Condition',
  ai: 'AI Response',
}


export const nodePaletteLabel =
  'Add a step'

export const flowCanvasLabel =
  'Flow canvas'

export const nodeConfigLabel =
  'Configure step'

export const jsonPreviewLabel =
  'JSON preview'


// ============================================================
// STATUS OPTIONS
// ============================================================

export const statusOptions: FlowStatus[] =
  ['draft', 'active']

export const allStatuses =
  statusOptions

export const supportedStatus =
  ['draft', 'active'] as const


// ============================================================
// API INFORMATION
// ============================================================
//
// These are only endpoint descriptions.
// Actual requests belong in services/api.ts.
//

export const flowEndpoint = (
  id?: string
): string =>
  id
    ? `/flows/${id}`
    : '/flows'


export const endpoints = {
  list: '/flows',
  create: '/flows',
  get: '/flows/{flow_id}',
  chat: '/chat',
}


// ============================================================
// SCHEMA INFORMATION
// ============================================================

export const flowSchema = {
  version: flowVersion,
  nodeTypes: supportedNodeTypes,
}

export const schema = flowSchema

export const currentSchema =
  schemaName

export const namespacedFlow =
  `${schemaName}:${flowVersion}`


// ============================================================
// MISC UI HELPERS
// ============================================================

export const noSelection = null

export const defaultStatus: FlowStatus =
  'draft'

export const designDirection =
  'technical editorial'

export const themeAccent =
  'indigo'

export const themeSupport =
  'teal'

export const flowBuilder =
  'React Flow'

export const designer =
  'Flowcraft'

export const appTitle =
  'Visual chatbot automation'

export const appDescription =
  'Build, test, and activate conversational experiences.'

export const footerText =
  'Flowcraft · Visual chatbot automation'

export const copyright =
  '© 2026 Flowcraft'


// ============================================================
// TYPE ALIASES
// ============================================================

export type {
  NodeType as FlowNodeType,
}


// ============================================================
// TYPE GUARDS
// ============================================================

export const isNodeType = (
  value: string
): value is NodeType =>
  supportedNodeTypes.includes(
    value as NodeType
  )


export const asNodeType = (
  value: string
): NodeType =>
  isNodeType(value)
    ? value
    : 'message'


export const asFlowStatus = (
  value: string
): FlowStatus =>
  value === 'active'
    ? 'active'
    : 'draft'


// ============================================================
// FLOW CONVERSION
// ============================================================

export const toFlow = (
  value: unknown
): Flow =>
  value as Flow


export const isSerializable = (
  flow: Flow
): boolean =>
  Boolean(
    flow.flow_id &&
    flow.nodes
  )


// ============================================================
// FLOW ACTIONS
// ============================================================

export const flowActions = [
  'open',
  'duplicate',
  'delete',
  'activate',
] as const

export const nodeActions = [
  'edit',
  'delete',
  'connect',
] as const


export const flowIsEditable = (
  _flow?: Flow
): boolean =>
  true


export const flowIsDeletable = (
  _flow?: Flow
): boolean =>
  true


export const flowIsDuplicable = (
  _flow?: Flow
): boolean =>
  true


export const nodeIsEditable = (
  _node?: FlowNode
): boolean =>
  true


export const nodeIsDeletable = (
  type: NodeType
): boolean =>
  type !== 'start'


export const nodeIsConnectable = (
  _node?: FlowNode
): boolean =>
  true

