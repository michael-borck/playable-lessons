import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { listModels, testConnection } from '../lib/aiService'

export default function SettingsPanel() {
  const aiProvider = useAppStore((s) => s.aiProvider)
  const setAIProvider = useAppStore((s) => s.setAIProvider)
  const apiKey = useAppStore((s) => s.apiKey)
  const setApiKey = useAppStore((s) => s.setApiKey)
  const claudeModel = useAppStore((s) => s.claudeModel)
  const setClaudeModel = useAppStore((s) => s.setClaudeModel)
  const openaiModel = useAppStore((s) => s.openaiModel)
  const setOpenaiModel = useAppStore((s) => s.setOpenaiModel)
  const ollamaUrl = useAppStore((s) => s.ollamaUrl)
  const setOllamaUrl = useAppStore((s) => s.setOllamaUrl)
  const ollamaModel = useAppStore((s) => s.ollamaModel)
  const setOllamaModel = useAppStore((s) => s.setOllamaModel)
  const ollamaToken = useAppStore((s) => s.ollamaToken)
  const setOllamaToken = useAppStore((s) => s.setOllamaToken)
  const customBaseUrl = useAppStore((s) => s.customBaseUrl)
  const setCustomBaseUrl = useAppStore((s) => s.setCustomBaseUrl)
  const customApiKey = useAppStore((s) => s.customApiKey)
  const setCustomApiKey = useAppStore((s) => s.setCustomApiKey)
  const customModel = useAppStore((s) => s.customModel)
  const setCustomModel = useAppStore((s) => s.setCustomModel)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [busy, setBusy] = useState<'test' | 'refresh' | null>(null)

  // Keep in-memory secrets in sync with the OS keychain.
  const persistSecret = (key: string, value: string) => { window.api.setSecret(key, value) }
  const updateApiKey = (v: string) => { setApiKey(v); persistSecret('apiKey', v) }
  const updateOllamaToken = (v: string) => { setOllamaToken(v); persistSecret('ollamaToken', v) }
  const updateCustomApiKey = (v: string) => { setCustomApiKey(v); persistSecret('customApiKey', v) }

  const handleTest = async () => {
    setBusy('test')
    setStatus(null)
    const result = await testConnection()
    setStatus({ ok: result.ok, message: result.message })
    if (result.models.length) setModels(result.models)
    setBusy(null)
  }

  const handleRefresh = async () => {
    setBusy('refresh')
    setStatus(null)
    try {
      const found = await listModels()
      setModels(found)
      setStatus({ ok: true, message: `Found ${found.length} model(s).` })
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : 'Could not list models' })
    }
    setBusy(null)
  }

  const showApiKey = aiProvider === 'claude' || aiProvider === 'openai' || aiProvider === 'auto'
  const showOllama = aiProvider === 'ollama' || aiProvider === 'auto'
  const showCustom = aiProvider === 'custom'

  return (
    <div className="panel">
      <h2 className="panel-title">Settings</h2>
      <p className="panel-subtitle">Configure AI providers and application preferences</p>

      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-title">AI Provider</div>

          <div className="form-group">
            <label className="form-label">Provider</label>
            <select
              className="form-select"
              value={aiProvider}
              onChange={(e) => { setAIProvider(e.target.value as typeof aiProvider); setModels([]); setStatus(null) }}
            >
              <option value="auto">Auto (API with local fallback)</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="custom">Custom (OpenAI-compatible)</option>
            </select>
          </div>

          {showApiKey && (
            <>
              <div className="form-group">
                <label className="form-label">
                  {aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
                </label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => updateApiKey(e.target.value)}
                />
                <div style={hintStyle}>Stored in your OS keychain. Never sent anywhere except the API provider.</div>
              </div>
              {aiProvider !== 'openai' && (
                <ModelInput label="Claude Model" value={claudeModel} onChange={setClaudeModel}
                  models={models} busy={busy} onRefresh={handleRefresh} />
              )}
              {aiProvider === 'openai' && (
                <ModelInput label="OpenAI Model" value={openaiModel} onChange={setOpenaiModel}
                  models={models} busy={busy} onRefresh={handleRefresh} />
              )}
            </>
          )}

          {showCustom && (
            <>
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="https://openrouter.ai/api/v1"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                />
                <div style={hintStyle}>
                  OpenAI-compatible endpoint (OpenRouter, LiteLLM, vLLM, a remote Ollama, …). Include the version path, e.g. <code>/v1</code>.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Bearer Token / API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="(optional)"
                  value={customApiKey}
                  onChange={(e) => updateCustomApiKey(e.target.value)}
                />
                <div style={hintStyle}>Stored in your OS keychain. Sent as an <code>Authorization: Bearer</code> header.</div>
              </div>
              <ModelInput label="Model" value={customModel} onChange={setCustomModel}
                models={models} busy={busy} onRefresh={handleRefresh} />
            </>
          )}

          {showOllama && (
            <>
              <div className="form-group">
                <label className="form-label">Ollama URL</label>
                <input
                  className="form-input"
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ollama Bearer Token</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="(optional — for a remote/authenticated Ollama)"
                  value={ollamaToken}
                  onChange={(e) => updateOllamaToken(e.target.value)}
                />
                <div style={hintStyle}>Leave blank for a local Ollama. Stored in your OS keychain.</div>
              </div>
              <ModelInput label="Ollama Model" value={ollamaModel} onChange={setOllamaModel}
                models={models} busy={busy} onRefresh={handleRefresh} />
            </>
          )}

          {/* Shared datalist of fetched models, referenced by every ModelInput. */}
          <datalist id="nf-model-options">
            {models.map((m) => <option key={m} value={m} />)}
          </datalist>

          <div className="form-group">
            <button className="btn btn-secondary" onClick={handleTest} disabled={busy !== null}>
              {busy === 'test' ? 'Testing…' : 'Test connection'}
            </button>
            {status && (
              <div style={{ marginTop: 8, fontSize: 13, color: status.ok ? 'var(--success)' : 'var(--error, #c0392b)' }}>
                {status.message}
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <div className="form-group">
            <label className="form-label">Theme</label>
            <select
              className="form-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as typeof theme)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

const hintStyle = { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } as const

function ModelInput({
  label,
  value,
  onChange,
  models,
  busy,
  onRefresh
}: {
  label: string
  value: string
  onChange: (v: string) => void
  models: string[]
  busy: 'test' | 'refresh' | null
  onRefresh: () => void
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          type="text"
          list="nf-model-options"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-secondary" onClick={onRefresh} disabled={busy !== null}>
          {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {models.length > 0 && (
        <div style={hintStyle}>{models.length} model(s) available — type or pick from the list.</div>
      )}
    </div>
  )
}
