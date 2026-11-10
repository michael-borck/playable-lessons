import { useAppStore, type StoryOutline } from '../stores/appStore'

/**
 * Inline editor for the generated story outline. Shown after the pipeline
 * pauses post-outline, before any prose is written. Editing here is cheaper
 * than regenerating a whole story and keeps the structure reviewable.
 */
export default function OutlineEditor({
  busy,
  onContinue,
  onRegenerate
}: {
  busy: boolean
  onContinue: () => void
  onRegenerate: () => void
}) {
  const outline = useAppStore((s) => s.storyOutline)
  const setStoryOutline = useAppStore((s) => s.setStoryOutline)
  if (!outline) return null

  const update = (patch: Partial<StoryOutline>) => setStoryOutline({ ...outline, ...patch })

  const updateNode = (id: string, patch: Partial<StoryOutline['nodes'][number]>) =>
    update({ nodes: outline.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })

  const addNode = () => {
    let n = outline.nodes.length + 1
    while (outline.nodes.some((node) => node.id === `node_${n}`)) n++
    update({ nodes: [...outline.nodes, { id: `node_${n}`, title: 'New scene', summary: '' }] })
  }

  const removeNode = (id: string) => {
    if (outline.nodes.length <= 1) return
    update({
      nodes: outline.nodes.filter((n) => n.id !== id),
      edges: outline.edges.filter((e) => e.from !== id && e.to !== id),
      canonPath: outline.canonPath.filter((n) => n !== id)
    })
  }

  const updateEdge = (index: number, patch: Partial<StoryOutline['edges'][number]>) =>
    update({ edges: outline.edges.map((e, i) => (i === index ? { ...e, ...patch } : e)) })

  const addEdge = () => {
    if (outline.nodes.length < 2) return
    update({
      edges: [
        ...outline.edges,
        { from: outline.nodes[0].id, to: outline.nodes[1].id, choiceText: 'Continue' }
      ]
    })
  }

  const removeEdge = (index: number) =>
    update({ edges: outline.edges.filter((_, i) => i !== index) })

  return (
    <div className="settings-section" style={{ marginBottom: 20 }}>
      <div className="settings-section-title">Story outline</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
        Review the structure before prose is generated. Edit scene titles and summaries, and
        wire the connections. Variables and the canonical path from the model are preserved.
      </p>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        {outline.nodes.length} scenes &middot; {outline.edges.length} connections &middot;{' '}
        {outline.variables.length} variables
      </div>

      <div style={{ marginBottom: 16 }}>
        {outline.nodes.map((node) => (
          <div key={node.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>id: {node.id}</div>
              <input
                className="form-input"
                value={node.title}
                placeholder="Scene title"
                onChange={(e) => updateNode(node.id, { title: e.target.value })}
              />
              <input
                className="form-input"
                value={node.summary}
                placeholder="What happens in this scene?"
                onChange={(e) => updateNode(node.id, { summary: e.target.value })}
              />
            </div>
            <button
              className="btn btn-secondary"
              disabled={outline.nodes.length <= 1 || busy}
              onClick={() => removeNode(node.id)}
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              Remove
            </button>
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addNode} disabled={busy} style={{ padding: '4px 10px', fontSize: 11 }}>
          + Add scene
        </button>
      </div>

      <div className="settings-section-title" style={{ fontSize: 13, marginBottom: 8 }}>Connections</div>
      {outline.edges.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          No connections yet — add one so the Ink prompt has a path graph.
        </div>
      )}
      {outline.edges.map((edge, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <select
            className="form-select"
            value={edge.from}
            onChange={(e) => updateEdge(i, { from: e.target.value })}
            style={{ width: 150, padding: '4px 8px', fontSize: 12 }}
          >
            {outline.nodes.map((n) => <option key={n.id} value={n.id}>{n.title || n.id}</option>)}
          </select>
          <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
          <select
            className="form-select"
            value={edge.to}
            onChange={(e) => updateEdge(i, { to: e.target.value })}
            style={{ width: 150, padding: '4px 8px', fontSize: 12 }}
          >
            {outline.nodes.map((n) => <option key={n.id} value={n.id}>{n.title || n.id}</option>)}
          </select>
          <input
            className="form-input"
            value={edge.choiceText}
            placeholder="Choice text"
            onChange={(e) => updateEdge(i, { choiceText: e.target.value })}
            style={{ flex: 1, minWidth: 140, padding: '4px 8px', fontSize: 12 }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => removeEdge(i)}
            disabled={busy}
            style={{ padding: '2px 8px', fontSize: 11 }}
          >
            &times;
          </button>
        </div>
      ))}
      <button
        className="btn btn-secondary"
        onClick={addEdge}
        disabled={outline.nodes.length < 2 || busy}
        style={{ padding: '4px 10px', fontSize: 11 }}
      >
        + Add connection
      </button>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={onContinue} disabled={busy || outline.nodes.length === 0}>
          {busy ? 'Generating prose…' : 'Continue to Ink'}
        </button>
        <button className="btn btn-secondary" onClick={onRegenerate} disabled={busy}>
          Regenerate outline
        </button>
      </div>
    </div>
  )
}
