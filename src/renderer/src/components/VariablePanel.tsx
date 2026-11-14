import { useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { parseInkSource, type InkVariable } from '../lib/inkParser'

export default function VariablePanel() {
  const inkSource = useAppStore((s) => s.inkSource)
  const applyInkEdit = useAppStore((s) => s.applyInkEdit)
  const [isOpen, setIsOpen] = useState(true)
  const [editingVar, setEditingVar] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [addMode, setAddMode] = useState(false)

  const parsed = useMemo(() => parseInkSource(inkSource), [inkSource])

  const updateVariable = (oldVar: InkVariable, name: string, value: string) => {
    const lines = inkSource.split('\n')
    lines[oldVar.line] = `VAR ${name} = ${value}`
    applyInkEdit(lines.join('\n'))
    setEditingVar(null)
  }

  const deleteVariable = (v: InkVariable) => {
    const lines = inkSource.split('\n')
    lines.splice(v.line, 1)
    applyInkEdit(lines.join('\n'))
  }

  const addVariable = () => {
    if (!newName.trim()) return
    const value = newValue.trim() || '0'
    // Insert after the last VAR declaration or at the top
    const lines = inkSource.split('\n')
    let insertAt = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('VAR ')) insertAt = i + 1
    }
    lines.splice(insertAt, 0, `VAR ${newName.trim()} = ${value}`)
    applyInkEdit(lines.join('\n'))
    setNewName('')
    setNewValue('')
    setAddMode(false)
  }

  if (!isOpen) {
    return (
      <div className="variable-panel" style={{ width: 'auto', padding: '8px 12px', cursor: 'pointer' }} onClick={() => setIsOpen(true)}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Variables ({parsed.variables.length})</span>
      </div>
    )
  }

  return (
    <div className="variable-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="variable-panel-title">Variables ({parsed.variables.length})</div>
        <button
          onClick={() => setIsOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
        >
          &times;
        </button>
      </div>

      {parsed.variables.map((v) => (
        <div key={v.name} className="variable-item">
          {editingVar === v.name ? (
            <EditRow
              name={v.name}
              value={String(v.initialValue)}
              onSave={(name, value) => updateVariable(v, name, value)}
              onCancel={() => setEditingVar(null)}
            />
          ) : (
            <>
              <span className="variable-name">{v.name}</span>
              <span className="variable-type">{v.type}</span>
              <span className="variable-value">{String(v.initialValue)}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setEditingVar(v.name)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }}
                >
                  edit
                </button>
                <button
                  onClick={() => deleteVariable(v)}
                  style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 11 }}
                >
                  del
                </button>
              </span>
            </>
          )}
        </div>
      ))}

      {addMode ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input
              className="form-input"
              placeholder="name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ padding: '3px 6px', fontSize: 12, flex: 1 }}
            />
            <input
              className="form-input"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{ padding: '3px 6px', fontSize: 12, width: 70 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-primary" onClick={addVariable} style={{ padding: '2px 8px', fontSize: 11 }}>Add</button>
            <button className="btn btn-secondary" onClick={() => setAddMode(false)} style={{ padding: '2px 8px', fontSize: 11 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddMode(true)}
          style={{ marginTop: 8, background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, width: '100%' }}
        >
          + Add Variable
        </button>
      )}
    </div>
  )
}

function EditRow({
  name,
  value,
  onSave,
  onCancel
}: {
  name: string
  value: string
  onSave: (name: string, value: string) => void
  onCancel: () => void
}) {
  const [n, setN] = useState(name)
  const [v, setV] = useState(value)

  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'center' }}>
      <input
        className="form-input"
        value={n}
        onChange={(e) => setN(e.target.value)}
        style={{ padding: '2px 4px', fontSize: 11, flex: 1 }}
      />
      <input
        className="form-input"
        value={v}
        onChange={(e) => setV(e.target.value)}
        style={{ padding: '2px 4px', fontSize: 11, width: 60 }}
      />
      <button onClick={() => onSave(n, v)} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontSize: 11 }}>ok</button>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}>x</button>
    </div>
  )
}
