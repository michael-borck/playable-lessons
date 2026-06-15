/**
 * Provider-agnostic AI client, shared by the renderer and the CLI.
 *
 * Pure and config-driven: callers pass a ProviderConfig (no Zustand store, no
 * DOM). Uses the global `fetch`/`AbortController`, available in both the
 * browser (renderer) and Node 18+ (CLI).
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ResolvedProvider = 'claude' | 'openai' | 'ollama' | 'custom'

export interface ProviderConfig {
  provider: ResolvedProvider
  model: string
  /** API key / bearer token (claude, openai, custom). */
  apiKey?: string
  /** Full base URL incl. version path for a custom OpenAI-compatible endpoint. */
  baseUrl?: string
  /** Ollama base URL (default http://localhost:11434). */
  ollamaUrl?: string
  /** Optional bearer token for a remote/authenticated Ollama. */
  ollamaToken?: string
}

// AI generations can be slow, but should not hang forever.
const REQUEST_TIMEOUT_MS = 120_000

interface FetchOpts {
  method: string
  headers: Record<string, string>
  body?: string
}

async function fetchWithTimeout(url: string, options: FetchOpts, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  }
}

/** Bearer headers, omitting Authorization when no token is configured. */
function bearerHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** Strip trailing slashes so `${base}/chat/completions` is well-formed. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

/** Send a chat completion to whichever provider the config selects. */
export async function callAI(messages: AIMessage[], config: ProviderConfig): Promise<string> {
  switch (config.provider) {
    case 'claude':
      return callClaude(messages, config.apiKey ?? '', config.model)
    case 'openai':
      return callOpenAICompatible(messages, config.apiKey ?? '', 'https://api.openai.com/v1', config.model)
    case 'custom':
      return callOpenAICompatible(messages, config.apiKey ?? '', normalizeBaseUrl(config.baseUrl ?? ''), config.model)
    case 'ollama':
    default:
      return callOllama(messages, config.ollamaUrl ?? DEFAULT_OLLAMA_URL, config.model, config.ollamaToken ?? '')
  }
}

async function callClaude(messages: AIMessage[], apiKey: string, model: string): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system')?.content || ''
  const nonSystemMessages = messages.filter((m) => m.role !== 'system')

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemMsg,
      messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content }))
    })
  })

  if (!response.ok) {
    throw new Error(`Claude API error (${response.status}): ${await response.text()}`)
  }
  const data = await response.json()
  const text = data?.content?.[0]?.text
  if (typeof text !== 'string') throw new Error('Claude API returned an unexpected response shape')
  return text
}

/**
 * Any OpenAI-compatible /chat/completions endpoint — OpenAI itself, plus custom
 * gateways (OpenRouter, LiteLLM, vLLM, a remote Ollama, …) behind a bearer token.
 */
async function callOpenAICompatible(
  messages: AIMessage[],
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<string> {
  if (!baseUrl) throw new Error('No base URL configured for the OpenAI-compatible endpoint')

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: bearerHeaders(apiKey),
    body: JSON.stringify({ model, messages, max_tokens: 8192 })
  })

  if (!response.ok) {
    throw new Error(`API error (${response.status}): ${await response.text()}`)
  }
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('API returned an unexpected response shape')
  return content
}

async function callOllama(messages: AIMessage[], url: string, model: string, token: string): Promise<string> {
  const response = await fetchWithTimeout(`${normalizeBaseUrl(url)}/api/chat`, {
    method: 'POST',
    headers: bearerHeaders(token),
    body: JSON.stringify({ model, messages, stream: false })
  })

  if (!response.ok) {
    throw new Error(`Ollama error (${response.status}): ${await response.text()}`)
  }
  const data = await response.json()
  const content = data?.message?.content
  if (typeof content !== 'string') throw new Error('Ollama returned an unexpected response shape')
  return content
}

// ─── Model discovery & connection testing ───

/** List available models for the configured provider. */
export async function listModels(config: ProviderConfig): Promise<string[]> {
  switch (config.provider) {
    case 'claude':
      return listAnthropicModels(config.apiKey ?? '')
    case 'openai':
      return listOpenAICompatibleModels('https://api.openai.com/v1', config.apiKey ?? '')
    case 'custom':
      return listOpenAICompatibleModels(normalizeBaseUrl(config.baseUrl ?? ''), config.apiKey ?? '')
    case 'ollama':
    default:
      return listOllamaModels(config.ollamaUrl ?? DEFAULT_OLLAMA_URL, config.ollamaToken ?? '')
  }
}

async function listAnthropicModels(apiKey: string): Promise<string[]> {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/models?limit=100', {
    method: 'GET',
    headers: anthropicHeaders(apiKey)
  }, 30_000)
  if (!response.ok) throw new Error(`Claude API error (${response.status}): ${await response.text()}`)
  const data = await response.json()
  return (data?.data ?? []).map((m: { id: string }) => m.id).filter(Boolean)
}

async function listOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!baseUrl) throw new Error('No base URL configured')
  const response = await fetchWithTimeout(`${baseUrl}/models`, {
    method: 'GET',
    headers: bearerHeaders(apiKey)
  }, 30_000)
  if (!response.ok) throw new Error(`API error (${response.status}): ${await response.text()}`)
  const data = await response.json()
  return (data?.data ?? []).map((m: { id: string }) => m.id).filter(Boolean).sort()
}

async function listOllamaModels(url: string, token: string): Promise<string[]> {
  const response = await fetchWithTimeout(`${normalizeBaseUrl(url)}/api/tags`, {
    method: 'GET',
    headers: bearerHeaders(token)
  }, 30_000)
  if (!response.ok) throw new Error(`Ollama error (${response.status}): ${await response.text()}`)
  const data = await response.json()
  return (data?.models ?? []).map((m: { name: string }) => m.name).filter(Boolean)
}

/**
 * Probe the configured endpoint + credentials by listing models. Doubles as the
 * "Test connection" check and the source for "Refresh models".
 */
export async function testConnection(
  config: ProviderConfig
): Promise<{ ok: boolean; message: string; models: string[] }> {
  try {
    const models = await listModels(config)
    return { ok: true, message: `Connected — ${models.length} model(s) available.`, models }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Connection failed', models: [] }
  }
}
