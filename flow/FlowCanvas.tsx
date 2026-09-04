'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Circle,
  Trash2,
  X,
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

const NODE_WIDTH = 168
const NODE_HEIGHT = 50

type ConnectionSide = 'top' | 'right' | 'bottom' | 'left'
type ConnectionHandle = 'each' | 'done' | 'next'

type Point = { x: number; y: number }
type Rect = { left: number; top: number; right: number; bottom: number }

const ROUTE_GAP = 22
const NODE_ROUTE_PADDING = 14
const EDGE_CORNER_RADIUS = 10

const SIDE_STYLE: Record<ConnectionSide, React.CSSProperties> = {
  top: {
    left: '50%',
    top: -7,
    transform: 'translate(-50%, 0)',
  },
  right: {
    right: -7,
    top: '50%',
    transform: 'translate(0, -50%)',
  },
  bottom: {
    left: '50%',
    bottom: -7,
    transform: 'translate(-50%, 0)',
  },
  left: {
    left: -7,
    top: '50%',
    transform: 'translate(0, -50%)',
  },
}

function nodeRect(node: FlowNode, padding = 0): Rect {
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + NODE_WIDTH + padding,
    bottom: node.position.y + NODE_HEIGHT + padding,
  }
}

function getAnchor(
  node: FlowNode,
  side: ConnectionSide,
  handle: ConnectionHandle = 'next',
): Point {
  const semanticOffset = handle === 'each' ? 0.35 : handle === 'done' ? 0.68 : 0.5

  if (side === 'left') {
    return {
      x: node.position.x,
      y: node.position.y + NODE_HEIGHT * semanticOffset,
    }
  }

  if (side === 'right') {
    return {
      x: node.position.x + NODE_WIDTH,
      y: node.position.y + NODE_HEIGHT * semanticOffset,
    }
  }

  if (side === 'top') {
    return {
      x: node.position.x + NODE_WIDTH * semanticOffset,
      y: node.position.y,
    }
  }

  return {
    x: node.position.x + NODE_WIDTH * semanticOffset,
    y: node.position.y + NODE_HEIGHT,
  }
}

function offsetPoint(point: Point, side: ConnectionSide, amount = ROUTE_GAP): Point {
  if (side === 'left') return { x: point.x - amount, y: point.y }
  if (side === 'right') return { x: point.x + amount, y: point.y }
  if (side === 'top') return { x: point.x, y: point.y - amount }
  return { x: point.x, y: point.y + amount }
}

function chooseConnectionSides(source: FlowNode, target: FlowNode): {
  sourceSide: ConnectionSide
  targetSide: ConnectionSide
  orientation: 'horizontal' | 'vertical'
} {
  const sourceCenter = {
    x: source.position.x + NODE_WIDTH / 2,
    y: source.position.y + NODE_HEIGHT / 2,
  }
  const targetCenter = {
    x: target.position.x + NODE_WIDTH / 2,
    y: target.position.y + NODE_HEIGHT / 2,
  }

  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y

  // Prefer the axis with the most free space. This lets an edge automatically
  // move from right/left handles to top/bottom handles as nodes are rearranged.
  if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
    return dx >= 0
      ? { sourceSide: 'right', targetSide: 'left', orientation: 'horizontal' }
      : { sourceSide: 'left', targetSide: 'right', orientation: 'horizontal' }
  }

  return dy >= 0
    ? { sourceSide: 'bottom', targetSide: 'top', orientation: 'vertical' }
    : { sourceSide: 'top', targetSide: 'bottom', orientation: 'vertical' }
}

function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  if (Math.abs(a.x - b.x) < 0.01) {
    const x = a.x
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    return x >= rect.left && x <= rect.right && maxY >= rect.top && minY <= rect.bottom
  }

  if (Math.abs(a.y - b.y) < 0.01) {
    const y = a.y
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    return y >= rect.top && y <= rect.bottom && maxX >= rect.left && minX <= rect.right
  }

  return false
}

function routeHitsObstacles(points: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (obstacles.some((rect) => segmentHitsRect(points[i], points[i + 1], rect))) {
      return true
    }
  }
  return false
}

function compactPoints(points: Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const previous = result[result.length - 1]
    if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) {
      continue
    }
    result.push(point)
  }

  // Remove unnecessary collinear points so the SVG stays clean.
  let changed = true
  while (changed && result.length > 2) {
    changed = false
    for (let i = 1; i < result.length - 1; i += 1) {
      const a = result[i - 1]
      const b = result[i]
      const c = result[i + 1]
      const collinearX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01
      const collinearY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01
      if (collinearX || collinearY) {
        result.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return result
}

function roundedOrthogonalPath(points: Point[]): string {
  const clean = compactPoints(points)
  if (clean.length === 0) return ''
  if (clean.length === 1) return `M ${clean[0].x} ${clean[0].y}`

  let path = `M ${clean[0].x} ${clean[0].y}`

  for (let i = 1; i < clean.length - 1; i += 1) {
    const prev = clean[i - 1]
    const current = clean[i]
    const next = clean[i + 1]

    const incoming = Math.hypot(current.x - prev.x, current.y - prev.y)
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y)
    const radius = Math.min(EDGE_CORNER_RADIUS, incoming / 2, outgoing / 2)

    const before: Point = {
      x: current.x + (prev.x - current.x) * (radius / Math.max(incoming, 0.001)),
      y: current.y + (prev.y - current.y) * (radius / Math.max(incoming, 0.001)),
    }
    const after: Point = {
      x: current.x + (next.x - current.x) * (radius / Math.max(outgoing, 0.001)),
      y: current.y + (next.y - current.y) * (radius / Math.max(outgoing, 0.001)),
    }

    path += ` L ${before.x} ${before.y}`
    path += ` Q ${current.x} ${current.y} ${after.x} ${after.y}`
  }

  const last = clean[clean.length - 1]
  path += ` L ${last.x} ${last.y}`
  return path
}

function pointAtRouteMiddle(points: Point[]): Point {
  const clean = compactPoints(points)
  if (clean.length < 2) return clean[0] || { x: 0, y: 0 }

  const lengths = clean.slice(0, -1).map((point, index) =>
    Math.hypot(clean[index + 1].x - point.x, clean[index + 1].y - point.y),
  )
  const total = lengths.reduce((sum, value) => sum + value, 0)
  let remaining = total / 2

  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const ratio = lengths[i] === 0 ? 0 : remaining / lengths[i]
      return {
        x: clean[i].x + (clean[i + 1].x - clean[i].x) * ratio,
        y: clean[i].y + (clean[i + 1].y - clean[i].y) * ratio,
      }
    }
    remaining -= lengths[i]
  }

  return clean[clean.length - 1]
}

function stableLaneOffset(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  const lane = Math.abs(hash) % 5
  return (lane - 2) * 9
}

function buildSmartRoute(
  source: FlowNode,
  target: FlowNode,
  handle: ConnectionHandle,
  allNodes: FlowNode[],
  edgeId: string,
): { points: Point[]; sourceSide: ConnectionSide; targetSide: ConnectionSide } {
  const { sourceSide, targetSide, orientation } = chooseConnectionSides(source, target)
  const start = getAnchor(source, sourceSide, handle)
  const end = getAnchor(target, targetSide, 'next')
  const startOut = offsetPoint(start, sourceSide)
  const endOut = offsetPoint(end, targetSide)
  const lane = stableLaneOffset(edgeId)

  const obstacles = allNodes
    .filter((node) => node.id !== source.id && node.id !== target.id)
    .map((node) => nodeRect(node, NODE_ROUTE_PADDING))

  let points: Point[]

  if (orientation === 'horizontal') {
    const midX = (startOut.x + endOut.x) / 2 + lane
    points = [
      start,
      startOut,
      { x: midX, y: startOut.y },
      { x: midX, y: endOut.y },
      endOut,
      end,
    ]

    if (routeHitsObstacles(points, obstacles)) {
      const relevant = obstacles.filter((rect) => {
        const minX = Math.min(startOut.x, endOut.x)
        const maxX = Math.max(startOut.x, endOut.x)
        return rect.right >= minX && rect.left <= maxX
      })
      const topY = Math.min(startOut.y, endOut.y, ...relevant.map((rect) => rect.top)) - ROUTE_GAP - 12 - Math.abs(lane)
      const bottomY = Math.max(startOut.y, endOut.y, ...relevant.map((rect) => rect.bottom)) + ROUTE_GAP + 12 + Math.abs(lane)
      const topCost = Math.abs(startOut.y - topY) + Math.abs(endOut.y - topY)
      const bottomCost = Math.abs(startOut.y - bottomY) + Math.abs(endOut.y - bottomY)
      const detourY = topY >= 12 && topCost <= bottomCost ? topY : bottomY
      points = [
        start,
        startOut,
        { x: startOut.x, y: detourY },
        { x: endOut.x, y: detourY },
        endOut,
        end,
      ]
    }
  } else {
    const midY = (startOut.y + endOut.y) / 2 + lane
    points = [
      start,
      startOut,
      { x: startOut.x, y: midY },
      { x: endOut.x, y: midY },
      endOut,
      end,
    ]

    if (routeHitsObstacles(points, obstacles)) {
      const relevant = obstacles.filter((rect) => {
        const minY = Math.min(startOut.y, endOut.y)
        const maxY = Math.max(startOut.y, endOut.y)
        return rect.bottom >= minY && rect.top <= maxY
      })
      const leftX = Math.min(startOut.x, endOut.x, ...relevant.map((rect) => rect.left)) - ROUTE_GAP - 12 - Math.abs(lane)
      const rightX = Math.max(startOut.x, endOut.x, ...relevant.map((rect) => rect.right)) + ROUTE_GAP + 12 + Math.abs(lane)
      const leftCost = Math.abs(startOut.x - leftX) + Math.abs(endOut.x - leftX)
      const rightCost = Math.abs(startOut.x - rightX) + Math.abs(endOut.x - rightX)
      const detourX = leftX >= 12 && leftCost <= rightCost ? leftX : rightX
      points = [
        start,
        startOut,
        { x: detourX, y: startOut.y },
        { x: detourX, y: endOut.y },
        endOut,
        end,
      ]
    }
  }

  return { points: compactPoints(points), sourceSide, targetSide }
}

const NODE_COLORS: Record<NodeType, string> = {
  start: '#7c3aed',
  message: '#2563eb',
  buttons: '#0f766e',
  input: '#d97706',
  condition: '#ea580c',
  switch: '#4f46e5',
  ai: '#db2777',
  data_source: '#059669',
  end: '#64748b',
  for_each: '#4f46e5',
  whatsapp: '#16a34a',
}

function FlowNodeCard({
  node,
  selected,
  connectionMode,
  connectionSource,
  onSelect,
  onMove,
  onDelete,
  onConnectionHandle,
}: {
  node: FlowNode
  selected: boolean
  connectionMode: boolean
  connectionSource: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onDelete: () => void
  onConnectionHandle: (side: ConnectionSide, handle?: ConnectionHandle) => void
}) {
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)

  const color = NODE_COLORS[node.type]

  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
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

  const canStartConnection = node.type !== 'end'
  const canReceiveConnection = node.type !== 'start'
  const sides: ConnectionSide[] = ['top', 'right', 'bottom', 'left']

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
        border: selected ? `2px solid ${color}` : '1px solid #dbe2ec',
        borderRadius: 12,
        boxShadow: selected
          ? `0 0 0 3px ${color}22, 0 8px 24px rgba(15,23,42,.10)`
          : '0 5px 18px rgba(15,23,42,.07)',
        cursor: 'grab',
        userSelect: 'none',
        zIndex: selected ? 20 : 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              flexShrink: 0,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              background: `${color}15`,
              color,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {nodeIcons[node.type]}
          </span>

          <div style={{ minWidth: 0 }}>
            <div
              title={node.config.label || NODE_META[node.type].label}
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: '#334155',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {node.config.label || NODE_META[node.type].label}
            </div>

            <div style={{ fontSize: 8.5, color: '#94a3b8' }}>
              {node.type}
            </div>
          </div>
        </div>

        {node.type !== 'start' && (
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            style={{
              border: 0,
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 2,
              flexShrink: 0,
            }}
            title="Delete node"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Universal connection handles. In normal mode they start a connection;
          while connecting they become target handles. This keeps the canvas
          clean while allowing top/right/bottom/left routing. */}
      {sides.map((side) => {
        const isTargetHandle = connectionMode && !connectionSource && canReceiveConnection
        const isSourceHandle = !connectionMode && canStartConnection
        const visible = isTargetHandle || isSourceHandle || connectionSource

        if (!visible) return null

        const semanticHandle: ConnectionHandle =
          node.type === 'for_each'
            ? (side === 'bottom' ? 'done' : 'each')
            : 'next'

        const title = connectionMode
          ? `Connect here (${side})`
          : node.type === 'for_each'
            ? `${semanticHandle === 'done' ? 'Done' : 'Each'} connection (${side})`
            : `Start connection from ${side}`

        return (
          <button
            key={side}
            type="button"
            title={title}
            aria-label={title}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onConnectionHandle(side, semanticHandle)
            }}
            style={{
              position: 'absolute',
              ...SIDE_STYLE[side],
              width: connectionMode ? 15 : 13,
              height: connectionMode ? 15 : 13,
              borderRadius: '50%',
              background: isTargetHandle ? '#ffffff' : color,
              border: isTargetHandle ? `2px solid ${color}` : '2px solid #ffffff',
              boxShadow: isTargetHandle
                ? `0 0 0 3px ${color}18, 0 2px 7px rgba(15,23,42,.16)`
                : '0 1px 5px rgba(15,23,42,.18)',
              display: 'grid',
              placeItems: 'center',
              cursor: connectionSource ? 'default' : 'crosshair',
              zIndex: 35,
              padding: 0,
              transition: 'transform .12s ease, box-shadow .12s ease',
            }}
          >
            <Circle
              size={4}
              color={isTargetHandle ? color : '#ffffff'}
              fill={isTargetHandle ? color : '#ffffff'}
            />
          </button>
        )
      })}

      {node.type === 'for_each' && !connectionMode && (
        <>
          <span
            style={{
              position: 'absolute',
              right: 10,
              top: -18,
              fontSize: 8,
              color: '#4f46e5',
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            Each
          </span>
          <span
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -22,
              transform: 'translateX(-50%)',
              fontSize: 8,
              color: '#64748b',
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            Done
          </span>
        </>
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

  const [connectingFrom, setConnectingFrom] = useState<{ id: string; handle: ConnectionHandle; side: ConnectionSide } | null>(
    null,
  )

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedEdgeId) return
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteEdge(selectedEdgeId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEdgeId, flow.edges])

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
   * DELETE EDGE
   * ----------------------------------------------------------
   */
  const deleteEdge = (id: string) => {
    onChange({
      ...flow,
      edges: flow.edges.filter((edge) => edge.id !== id),
    })
    setSelectedEdgeId(null)
  }

  /*
   * ----------------------------------------------------------
   * DROP NODE FROM PALETTE
   * ----------------------------------------------------------
   */
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
    side: ConnectionSide,
    handle: ConnectionHandle = 'next',
  ) => {
    setConnectingFrom({ id: nodeId, handle, side })
    setSelectedEdgeId(null)
  }

  const finishConnection = (
    targetId: string,
  ) => {
    if (!connectingFrom) {
      return
    }

    if (connectingFrom.id === targetId) {
      setConnectingFrom(null)
      return
    }

    const alreadyExists =
      flow.edges.some(
        (edge) =>
          edge.source === connectingFrom.id &&
          edge.target === targetId &&
          (edge.sourceHandle || 'next') === connectingFrom.handle,
      )

    if (!alreadyExists) {
      const label =
        connectingFrom.handle === 'each'
          ? 'Each'
          : connectingFrom.handle === 'done'
            ? 'Done'
            : undefined

      onChange({
        ...flow,
        edges: [
          ...flow.edges,
          {
            id: `edge-${connectingFrom.id}-${targetId}-${Date.now()}`,
            source: connectingFrom.id,
            target: targetId,
            label,
            sourceHandle: connectingFrom.handle,
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
        const source = flow.nodes.find((node) => node.id === edge.source)
        const target = flow.nodes.find((node) => node.id === edge.target)

        if (!source || !target) return null

        const handle = (edge.sourceHandle || 'next') as ConnectionHandle
        const route = buildSmartRoute(source, target, handle, flow.nodes, edge.id)
        const middle = pointAtRouteMiddle(route.points)

        return {
          id: edge.id,
          path: roundedOrthogonalPath(route.points),
          label: edge.label,
          labelX: middle.x,
          labelY: middle.y - 8,
          sourceSide: route.sourceSide,
          targetSide: route.targetSide,
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
        setSelectedEdgeId(null)
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
                    stroke={selectedEdgeId === line.id ? '#4f46e5' : '#94a3b8'}
                    strokeWidth={selectedEdgeId === line.id ? 3 : 2}
                    markerEnd="url(#flow-arrow)"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedEdgeId(line.id)
                      setConnectingFrom(null)
                    }}
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

        {/* Selected edge actions */}
        {selectedEdgeId && (() => {
          const selected = connectionLines.find((line: any) => line.id === selectedEdgeId) as any
          if (!selected) return null
          return (
            <div
              style={{
                position: 'absolute',
                left: selected.labelX - 48,
                top: selected.labelY - 18,
                zIndex: 40,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 7,
                padding: 3,
                boxShadow: '0 4px 14px rgba(15,23,42,.12)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => deleteEdge(selectedEdgeId)}
                title="Delete connection"
                aria-label="Delete connection"
                style={{
                  border: 0,
                  background: '#fef2f2',
                  color: '#dc2626',
                  borderRadius: 5,
                  width: 25,
                  height: 25,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedEdgeId(null)}
                title="Close"
                aria-label="Close"
                style={{
                  border: 0,
                  background: 'transparent',
                  color: '#94a3b8',
                  borderRadius: 5,
                  width: 20,
                  height: 25,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })()}

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
              selected={connectingFrom?.id === node.id}
              connectionMode={Boolean(connectingFrom)}
              connectionSource={connectingFrom?.id === node.id}
              onSelect={() => {
                if (connectingFrom) {
                  finishConnection(node.id)
                } else {
                  onSelect(node.id)
                }
              }}
              onMove={(x, y) => moveNode(node.id, x, y)}
              onDelete={() => deleteNode(node.id)}
              onConnectionHandle={(side, handle) => {
                if (connectingFrom) {
                  if (connectingFrom.id !== node.id) finishConnection(node.id)
                } else {
                  startConnection(node.id, side, handle)
                }
              }}
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
            Choose any handle on the target node • edges route around nodes automatically
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