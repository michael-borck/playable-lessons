import { useEffect, useState } from 'react'
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
  const timerAutoAdvance = useAppStore((s) => s.timerAutoAdvance)
  const setTimerAutoAdvance = useAppStore((s) => s.setTimerAutoAdvance)
  const imageProvider = useAppStore((s) => s.imageProvider)
  const setImageProvider = useAppStore((s) => s.setImageProvider)
  const imageModel = useAppStore((s) => s.imageModel)
  const setImageModel = useAppStore((s) => s.setImageModel)
  const imageBaseUrl = useAppStore((s) => s.imageBaseUrl)
  const setImageBaseUrl = useAppStore((s) => s.setImageBaseUrl)
  const imageApiKey = useAppStore((s) => s.imageApiKey)
  const setImageApiKey = useAppStore((s) => s.setImageApiKey)
  const geminiApiKey = useAppStore((s) => s.geminiApiKey)
  const setGeminiApiKey = useAppStore((s) => s.setGeminiApiKey)

  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [busy, setBusy] = useState<'test' | 'refresh' | null>(null)
  const [secretNotice, setSecretNotice] = useState<string | null>(null)

  // Tell the user up front when the OS can't actually encrypt secrets (or is
  // using the weak Linux basic_text backend) instead of pretending the key is
  // safely persisted.
  useEffect(() => {
    window.api.getSecretStatus().then((s) => {
      if (!s.encryptionAvailable) {
        setSecretNotice('OS secure storage is unavailable — API keys are kept in memory for this session only.')
      } else if (s.backend === 'basic_text') {
        setSecretNotice(
          'The OS keychain is using the basic_text backend (obfuscated, not encrypted at rest). Set up gnome-keyring or KWallet for stronger protection.'
        )
      }
    }).catch(() => {})
  }, [])

  // Keep in-memory secrets in sync with the OS keychain.
  const persistSecret = (key: string, value: string) => {
    window.api.setSecret(key, value)
      .then((ok) => {
        if (!ok) {
          setSecretNotice('OS secure storage is unavailable — this key is kept in memory for this session only.')
        }
      })
      .catch(() => {
        setSecretNotice('Could not save the key to the OS keychain — it is kept in memory for this session only.')
      })
  }
  const updateApiKey = (v: string) => { setApiKey(v); persistSecret('apiKey', v) }
  const updateOllamaToken = (v: string) => { setOllamaToken(v); persistSecret('ollamaToken', v) }
  const updateCustomApiKey = (v: string) => { setCustomApiKey(v); persistSecret('customApiKey', v) }
  const updateImageApiKey = (v: string) => { setImageApiKey(v); persistSecret('imageApiKey', v) }
  const updateGeminiApiKey = (v: string) => { setGeminiApiKey(v); persistSecret('geminiApiKey', v) }

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

      {secretNotice && (
        <div style={{
          background: 'rgba(232, 168, 56, 0.15)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          marginBottom: 20,
          color: 'var(--warning)',
          fontSize: 13
        }}>
          {secretNotice}
        </div>
      )}

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
          <div className="settings-section-title">Scene Images</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
            Used when &ldquo;Generate an illustration for every scene&rdquo; is ticked on the input
            screen. The story itself is still written by your AI provider above.
          </p>

          <div className="form-group">
            <label className="form-label">Image Provider</label>
            <select
              className="form-select"
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value as typeof imageProvider)}
            >
              <option value="openai">OpenAI (gpt-image-1 / DALL-E 3)</option>
              <option value="gemini">Google Imagen</option>
              <option value="custom">Custom (OpenAI-compatible endpoint)</option>
              <option value="swarmui">SwarmUI (self-hosted)</option>
            </select>
          </div>

          {imageProvider === 'openai' && (
            <>
              <div className="form-group">
                <label className="form-label">Image Model</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="gpt-image-1"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">OpenAI Image API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="sk-... (leave blank to reuse the main API key)"
                  value={imageApiKey}
                  onChange={(e) => updateImageApiKey(e.target.value)}
                />
                <div style={hintStyle}>
                  Stored in your OS keychain. Reuses the main API key above when the AI provider is OpenAI.
                </div>
              </div>
            </>
          )}

          {imageProvider === 'gemini' && (
            <>
              <div className="form-group">
                <label className="form-label">Imagen Model</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="imagen-4.0-fast-generate-001"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Google API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="AIza..."
                  value={geminiApiKey}
                  onChange={(e) => updateGeminiApiKey(e.target.value)}
                />
                <div style={hintStyle}>Stored in your OS keychain. Needs access to the Imagen API.</div>
              </div>
            </>
          )}

          {(imageProvider === 'custom' || imageProvider === 'swarmui') && (
            <>
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={imageProvider === 'swarmui' ? 'https://swarmui.example.org' : 'http://localhost:8080/v1'}
                  value={imageBaseUrl}
                  onChange={(e) => setImageBaseUrl(e.target.value)}
                />
                <div style={hintStyle}>
                  {imageProvider === 'swarmui'
                    ? 'Your SwarmUI server address (its native API is used, not /images/generations).'
                    : <>Any OpenAI-compatible <code>/images/generations</code> endpoint (LocalAI, …). Include the version path, e.g. <code>/v1</code>.</>}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Image Model</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={imageProvider === 'swarmui' ? '(optional — server default if blank)' : '(required by the endpoint)'}
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Bearer Token / API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="(optional)"
                  value={imageApiKey}
                  onChange={(e) => updateImageApiKey(e.target.value)}
                />
                <div style={hintStyle}>Stored in your OS keychain. Leave blank for an unauthenticated server.</div>
              </div>
            </>
          )}
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

        <div className="settings-section">
          <div className="settings-section-title">Accessibility</div>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={timerAutoAdvance}
                onChange={(e) => setTimerAutoAdvance(e.target.checked)}
              />
              Timed choices auto-select the first option when the timer runs out
            </label>
            <div style={hintStyle}>
              Turn this off so every reader gets to choose; the countdown still displays.
            </div>
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
