'use client'

import { useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Circle,
  Trash2,
} from 'lucide-react'

import {
  NODE_META,
  createNode,
  nodeIcons,
  type Flow,
  type FlowNode,
  type NodeType,
} from '@/types/flow'

type FlowCanvasProps = {
  flow: Flow
  onChange: (flow: Flow) => void
  onSelect: (id: string | null) => void
}

const NODE_WIDTH = 230
const NODE_HEIGHT = 115

const NODE_COLORS: Record<NodeType, string> = {
  start: '#7c3aed',
  message: '#2563eb',
  buttons: '#0f766e',
  input: '#d97706',
  condition: '#ea580c',
  ai: '#db2777',
  end: '#64748b',
}

function FlowNodeCard({
  node,
  selected,
  onSelect,
  onMove,
  onDelete,
  onStartConnect,
}: {
  node: FlowNode
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onDelete: () => void
  onStartConnect: () => void
}) {
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)

  const color = NODE_COLORS[node.type]

  const preview =
    node.config.text ||
    node.config.prompt ||
    node.config.condition ||
    node.config.options?.join(' • ') ||
    NODE_META[node.type].description

  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (node.type === 'start') {
      // Start node can still be moved
    }

    dragging.current = true

    dragOffset.current = {
      x: event.clientX - node.position.x,
      y: event.clientY - node.position.y,
    }

    const move = (e: MouseEvent) => {
      if (!dragging.current) return

      onMove(
        Math.max(10, e.clientX - dragOffset.current.x),
        Math.max(10, e.clientY - dragOffset.current.y),
      )
    }

    const up = () => {
      dragging.current = false
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      onMouseDown={startDrag}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,

        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,

        background: '#ffffff',
        border: selected
          ? `2px solid ${color}`
          : '1px solid #dbe2ec',

        borderRadius: 12,

        boxShadow: selected
          ? `0 0 0 3px ${color}22, 0 8px 24px rgba(15,23,42,.10)`
          : '0 5px 18px rgba(15,23,42,.07)',

        cursor: 'grab',
        userSelect: 'none',
        zIndex: selected ? 20 : 10,
      }}
    >
      {/* Header */}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',

          borderBottom: '1px solid #eef2f7',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,

              display: 'grid',
              placeItems: 'center',

              background: `${color}15`,
              color,

              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {nodeIcons[node.type]}
          </span>

          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#334155',
              }}
            >
              {NODE_META[node.type].label}
            </div>

            <div
              style={{
                fontSize: 10,
                color: '#94a3b8',
              }}
            >
              {node.type}
            </div>
          </div>
        </div>

        {node.type !== 'start' && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            style={{
              border: 0,
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 3,
            }}
            title="Delete node"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Body */}

      <div
        style={{
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#334155',

            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {node.config.label}
        </div>

        <div
          style={{
            marginTop: 5,
            fontSize: 11,
            color: '#64748b',
            lineHeight: 1.4,

            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {preview}
        </div>
      </div>

      {/* Input connection handle */}

      {node.type !== 'start' && (
        <div
          title="Connection input"
          style={{
            position: 'absolute',
            left: -7,
            top: '50%',
            transform: 'translateY(-50%)',

            width: 14,
            height: 14,
            borderRadius: '50%',

            background: '#ffffff',
            border: `2px solid ${color}`,

            zIndex: 30,
          }}
        />
      )}

      {/* Output connection handle */}

      {node.type !== 'end' && (
        <button
          type="button"
          title="Connect to another node"
          onClick={(event) => {
            event.stopPropagation()
            onStartConnect()
          }}
          style={{
            position: 'absolute',
            right: -8,
            top: '50%',
            transform: 'translateY(-50%)',

            width: 16,
            height: 16,
            borderRadius: '50%',

            background: color,
            border: '2px solid #ffffff',

            display: 'grid',
            placeItems: 'center',

            cursor: 'crosshair',

            zIndex: 30,
            padding: 0,
          }}
        >
          <Circle size={5} color="#ffffff" fill="#ffffff" />
        </button>
      )}
    </div>
  )
}

export function FlowCanvas({
  flow,
  onChange,
  onSelect,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)

  const [connectingFrom, setConnectingFrom] = useState<string | null>(
    null,
  )

  const [dragOver, setDragOver] = useState(false)

  /*
   * ----------------------------------------------------------
   * NODE MOVEMENT
   * ----------------------------------------------------------
   */

  const moveNode = (
    id: string,
    x: number,
    y: number,
  ) => {
    onChange({
      ...flow,

      nodes: flow.nodes.map((node) =>
        node.id === id
          ? {
            ...node,
            position: {
              x,
              y,
            },
          }
          : node,
      ),
    })
  }

  /*
   * ----------------------------------------------------------
   * DELETE NODE
   * ----------------------------------------------------------
   */

  const deleteNode = (id: string) => {
    const node = flow.nodes.find(
      (item) => item.id === id,
    )

    if (!node || node.type === 'start') {
      return
    }

    onChange({
      ...flow,

      nodes: flow.nodes.filter(
        (item) => item.id !== id,
      ),

      edges: flow.edges.filter(
        (edge) =>
          edge.source !== id &&
          edge.target !== id,
      ),
    })

    onSelect(null)
  }

  /*
   * ----------------------------------------------------------
   * DROP NODE FROM PALETTE
   * ----------------------------------------------------------
   */

  const handleDragOver = (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()

    event.dataTransfer.dropEffect = 'copy'

    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()

    setDragOver(false)

    const type = event.dataTransfer.getData(
      'application/flow-node',
    ) as NodeType

    if (!type) {
      return
    }

    if (!canvasRef.current) {
      return
    }

    const rect =
      canvasRef.current.getBoundingClientRect()

    const x =
      event.clientX -
      rect.left -
      NODE_WIDTH / 2

    const y =
      event.clientY -
      rect.top -
      NODE_HEIGHT / 2

    const newNode = createNode(
      type,
      flow.nodes.length,
    )

    const positionedNode: FlowNode = {
      ...newNode,

      position: {
        x: Math.max(20, x),
        y: Math.max(20, y),
      },
    }

    const updatedFlow: Flow = {
      ...flow,

      nodes: [
        ...flow.nodes,
        positionedNode,
      ],
    }

    /*
     * If there is exactly one existing node with no outgoing
     * connection, automatically connect the dropped node to it.
     *
     * This gives the builder an n8n-like experience.
     */
    const outgoingSources = new Set(
      flow.edges.map(
        (edge) => edge.source,
      ),
    )

    const previousNode =
      [...flow.nodes]
        .reverse()
        .find(
          (node) =>
            node.type !== 'end' &&
            !outgoingSources.has(node.id),
        )

    if (previousNode) {
      updatedFlow.edges = [
        ...flow.edges,
        {
          id: `edge-${previousNode.id}-${positionedNode.id}-${Date.now()}`,
          source: previousNode.id,
          target: positionedNode.id,
        },
      ]
    }

    onChange(updatedFlow)

    onSelect(positionedNode.id)
  }

  /*
   * ----------------------------------------------------------
   * CONNECT NODES
   * ----------------------------------------------------------
   */

  const startConnection = (
    nodeId: string,
  ) => {
    setConnectingFrom(nodeId)
  }

  const finishConnection = (
    targetId: string,
  ) => {
    if (!connectingFrom) {
      return
    }

    if (connectingFrom === targetId) {
      setConnectingFrom(null)
      return
    }

    const alreadyExists =
      flow.edges.some(
        (edge) =>
          edge.source === connectingFrom &&
          edge.target === targetId,
      )

    if (!alreadyExists) {
      onChange({
        ...flow,

        edges: [
          ...flow.edges,

          {
            id: `edge-${connectingFrom}-${targetId}-${Date.now()}`,
            source: connectingFrom,
            target: targetId,
          },
        ],
      })
    }

    setConnectingFrom(null)
  }

  /*
   * ----------------------------------------------------------
   * SVG CONNECTION LINES
   * ----------------------------------------------------------
   */

  const connectionLines = useMemo(() => {
    return flow.edges
      .map((edge) => {
        const source = flow.nodes.find(
          (node) => node.id === edge.source,
        )

        const target = flow.nodes.find(
          (node) => node.id === edge.target,
        )

        if (!source || !target) {
          return null
        }

        const startX =
          source.position.x + NODE_WIDTH

        const startY =
          source.position.y +
          NODE_HEIGHT / 2

        const endX =
          target.position.x

        const endY =
          target.position.y +
          NODE_HEIGHT / 2

        const distance =
          Math.max(60, (endX - startX) / 2)

        const path = `
          M ${startX} ${startY}
          C
          ${startX + distance} ${startY},
          ${endX - distance} ${endY},
          ${endX} ${endY}
        `

        return {
          id: edge.id,
          path,
          label: edge.label,
          labelX:
            startX +
            (endX - startX) / 2,
          labelY:
            startY +
            (endY - startY) / 2 -
            8,
        }
      })
      .filter(Boolean)
  }, [flow.edges, flow.nodes])

  return (
    <div
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (connectingFrom) {
          setConnectingFrom(null)
        }

        onSelect(null)
      }}
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        minHeight: 650,

        overflow: 'auto',

        backgroundColor: '#f8fafc',

        backgroundImage: `
          radial-gradient(
            circle,
            #cbd5e1 1.3px,
            transparent 1.3px
          )
        `,

        backgroundSize: '28px 28px',

        borderLeft: '1px solid #e2e8f0',

        outline: dragOver
          ? '3px solid #6366f1'
          : 'none',

        outlineOffset: '-3px',
      }}
    >
      {/* Large drawing surface */}

      <div
        style={{
          position: 'relative',

          width: 2200,
          minHeight: 1000,
        }}
      >
        {/* SVG connections */}

        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',

            pointerEvents: 'none',

            overflow: 'visible',

            zIndex: 1,
          }}
        >
          <defs>
            <marker
              id="flow-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0,0 L8,4 L0,8 z"
                fill="#94a3b8"
              />
            </marker>
          </defs>

          {connectionLines.map(
            (line) =>
              line && (
                <g key={line.id}>
                  <path
                    d={line.path}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    markerEnd="url(#flow-arrow)"
                  />

                  {line.label && (
                    <text
                      x={line.labelX}
                      y={line.labelY}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize={10}
                    >
                      {line.label}
                    </text>
                  )}
                </g>
              ),
          )}
        </svg>

        {/* Empty canvas message */}

        {flow.nodes.length === 0 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 180,

              transform: 'translateX(-50%)',

              width: 360,

              padding: 30,

              textAlign: 'center',

              background: '#ffffff',

              border: '1px dashed #cbd5e1',
              borderRadius: 14,

              color: '#64748b',

              zIndex: 5,
            }}
          >
            <strong
              style={{
                display: 'block',
                color: '#334155',
                marginBottom: 7,
              }}
            >
              Build your flow
            </strong>

            <span style={{ fontSize: 12 }}>
              Drag a step from the left panel
              and drop it here.
            </span>
          </div>
        )}

        {/* Nodes */}

        {flow.nodes.map((node) => (
          <div
            key={node.id}
            onClick={(event) => {
              event.stopPropagation()

              if (connectingFrom) {
                finishConnection(node.id)
              } else {
                onSelect(node.id)
              }
            }}
          >
            <FlowNodeCard
              node={node}
              selected={
                connectingFrom === node.id
              }
              onSelect={() => {
                if (connectingFrom) {
                  finishConnection(node.id)
                } else {
                  onSelect(node.id)
                }
              }}
              onMove={(x, y) =>
                moveNode(node.id, x, y)
              }
              onDelete={() =>
                deleteNode(node.id)
              }
              onStartConnect={() =>
                startConnection(node.id)
              }
            />
          </div>
        ))}

        {/* Connection mode */}

        {connectingFrom && (
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 25,
              transform: 'translateX(-50%)',

              background: '#312e81',
              color: '#ffffff',

              padding: '9px 15px',

              borderRadius: 9,

              fontSize: 12,
              fontWeight: 600,

              zIndex: 100,

              boxShadow:
                '0 8px 30px rgba(15,23,42,.2)',
            }}
          >
            Select the node you want to connect to
          </div>
        )}

        {/* Drop hint */}

        {dragOver && (
          <div
            style={{
              position: 'absolute',

              inset: 20,

              border:
                '2px dashed #6366f1',

              borderRadius: 16,

              background:
                'rgba(99,102,241,.05)',

              pointerEvents: 'none',

              zIndex: 50,
            }}
          />
        )}
      </div>
    </div>
  )
}