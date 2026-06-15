import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeChange,
  addEdge,
  type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useAppStore } from '../stores/appStore'
import { parseInkSource, addKnot, removeKnot } from '../lib/inkParser'
import StoryNodeComponent from './StoryNode'
import ChoiceEdgeComponent from './ChoiceEdge'
import PassageEditor from './PassageEditor'
import VariablePanel from './VariablePanel'

const nodeTypes = { storyNode: StoryNodeComponent }
const edgeTypes = { choiceEdge: ChoiceEdgeComponent }

function layoutNodes(
  knotIds: string[],
  existingPositions: Record<string, { x: number; y: number }>,
  edges: { from: string; to: string }[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  const NODE_WIDTH = 280
  const NODE_HEIGHT = 180
  const H_GAP = 60
  const V_GAP = 80

  // Build adjacency for BFS layout
  const children: Record<string, string[]> = {}
  for (const id of knotIds) children[id] = []
  for (const e of edges) {
    if (children[e.from] && !children[e.from].includes(e.to)) {
      children[e.from].push(e.to)
    }
  }

  // BFS from the first knot
  const visited = new Set<string>()
  const queue: { id: string; depth: number; index: number }[] = []
  const depthCounts: Record<number, number> = {}

  if (knotIds.length > 0) {
    queue.push({ id: knotIds[0], depth: 0, index: 0 })
    visited.add(knotIds[0])
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    const count = depthCounts[depth] || 0
    depthCounts[depth] = count + 1

    // Use existing position if available, otherwise auto-layout
    if (existingPositions[id]) {
      positions[id] = existingPositions[id]
    } else {
      positions[id] = {
        x: count * (NODE_WIDTH + H_GAP),
        y: depth * (NODE_HEIGHT + V_GAP)
      }
    }

    for (const childId of children[id] || []) {
      if (!visited.has(childId)) {
        visited.add(childId)
        queue.push({ id: childId, depth: depth + 1, index: 0 })
      }
    }
  }

  // Place any unvisited nodes
  let extraX = 0
  for (const id of knotIds) {
    if (!positions[id]) {
      if (existingPositions[id]) {
        positions[id] = existingPositions[id]
      } else {
        positions[id] = { x: extraX, y: (Object.keys(depthCounts).length + 1) * (NODE_HEIGHT + V_GAP) }
        extraX += NODE_WIDTH + H_GAP
      }
    }
  }

  return positions
}

export default function NodeEditor() {
  const inkSource = useAppStore((s) => s.inkSource)
  const setInkSource = useAppStore((s) => s.setInkSource)
  const selectedNodeId = useAppStore((s) => s.selectedNodeId)
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId)
  const savedPositions = useAppStore((s) => s.nodePositions)
  const setNodePositions = useAppStore((s) => s.setNodePositions)
  const updateNodePosition = useAppStore((s) => s.updateNodePosition)

  const parsed = useMemo(() => parseInkSource(inkSource), [inkSource])

  const edgeData = useMemo(() => {
    const edges: { from: string; to: string; choiceText: string; condition: string | null }[] = []
    for (const knot of parsed.knots) {
      for (const choice of knot.choices) {
        if (choice.target) {
          edges.push({
            from: knot.id,
            to: choice.target,
            choiceText: choice.text,
            condition: choice.condition
          })
        }
      }
    }
    return edges
  }, [parsed])

  const positions = useMemo(
    () => layoutNodes(
      parsed.knots.map((k) => k.id),
      savedPositions,
      edgeData
    ),
    [parsed.knots, savedPositions, edgeData]
  )

  const initialNodes: Node[] = useMemo(
    () => parsed.knots.map((knot) => ({
      id: knot.id,
      type: 'storyNode',
      position: positions[knot.id] || { x: 0, y: 0 },
      data: {
        label: knot.title,
        content: knot.content,
        choices: knot.choices,
        timerSeconds: knot.timerSeconds,
        imagePath: knot.imagePath,
        endingType: knot.endingType,
        variableAssignments: knot.variableAssignments,
        isSelected: knot.id === selectedNodeId
      }
    })),
    [parsed, positions, selectedNodeId]
  )

  const initialEdges: Edge[] = useMemo(
    () => edgeData.map((e, i) => ({
      id: `e-${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      type: 'choiceEdge',
      data: { choiceText: e.choiceText, condition: e.condition },
      animated: false
    })),
    [edgeData]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when ink source changes
  useMemo(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNodeId(node.id)
  }, [setSelectedNodeId])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    // Persist position changes
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.id) {
        updateNodePosition(change.id, change.position.x, change.position.y)
      }
    }
  }, [onNodesChange, updateNodePosition])

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, type: 'choiceEdge', data: { choiceText: 'New choice' } }, eds))
  }, [setEdges])

  const handleAddNode = () => {
    const id = `new_node_${Date.now()}`
    const newSource = addKnot(inkSource, id)
    setInkSource(newSource)
  }

  const handleDeleteNode = () => {
    if (!selectedNodeId) return
    if (parsed.knots.length <= 1) return // don't delete the last node
    const newSource = removeKnot(inkSource, selectedNodeId)
    setInkSource(newSource)
    setSelectedNodeId(null)
  }

  const handleResetLayout = () => {
    setNodePositions({})
  }

  if (!inkSource.trim()) {
    return (
      <div className="panel">
        <h2 className="panel-title">Node Editor</h2>
        <p className="panel-subtitle">Generate a story first to use the visual editor.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Toolbar */}
        <div className="editor-toolbar">
          <button className="btn btn-secondary" onClick={handleAddNode} style={{ padding: '4px 12px', fontSize: 12 }}>
            + Add Node
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDeleteNode}
            disabled={!selectedNodeId}
            style={{ padding: '4px 12px', fontSize: 12 }}
          >
            Delete Node
          </button>
          <button className="btn btn-secondary" onClick={handleResetLayout} style={{ padding: '4px 12px', fontSize: 12 }}>
            Reset Layout
          </button>
          <span className="editor-info">
            {parsed.knots.length} nodes &middot; {edgeData.length} edges &middot; {parsed.variables.length} variables
          </span>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'choiceEdge' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#3a3b55" />
          <Controls
            showInteractive={false}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <VariablePanel />
          <MiniMap
            nodeColor={() => '#7c6ef0'}
            maskColor="rgba(26, 27, 46, 0.8)"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
          />
        </ReactFlow>
      </div>

      {/* Passage editor side panel */}
      {selectedNodeId && (
        <div className="passage-editor-panel">
          <PassageEditor />
        </div>
      )}
    </div>
  )
}
