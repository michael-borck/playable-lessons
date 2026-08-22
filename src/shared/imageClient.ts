/**
 * Provider-agnostic image generation, shared by the renderer and the CLI.
 *
 * Mirrors aiClient.ts: pure and config-driven (no Zustand store, no DOM), using
 * the global `fetch`/`AbortController` available in the browser and Node 18+.
 * Every provider returns a data URL so images embed directly into the preview,
 * project.json, and standalone HTML exports without filesystem access.
 *
 * Provider pattern borrowed from slide-stream's providers/images.py.
 */

export type ImageProvider = 'openai' | 'gemini' | 'custom'

export type ImageStyle = 'cartoon' | 'photorealistic'

export interface ImageProviderConfig {
  provider: ImageProvider
  /** Provider-specific model. Defaults: gpt-image-1 | imagen-4.0-fast-generate-001 | (required for custom). */
  model?: string
  /** API key / bearer token. Optional for a local custom endpoint. */
  apiKey?: string
  /** Base URL incl. version path for a custom OpenAI-compatible endpoint. */
  baseUrl?: string
  /**
   * Image size/aspect. OpenAI/custom: a size string ('1024x1024', '1536x1024',
   * '1024x1536' — '1792x1024'/'1024x1792' for dall-e-3). Gemini: an aspect
   * ratio ('1:1', '4:3', '16:9', '9:16').
   */
  size?: string
}

const REQUEST_TIMEOUT_MS = 180_000 // image generation can be slow

/** Short style directive prepended to every scene prompt. */
const STYLE_DIRECTIVES: Record<ImageStyle, string> = {
  cartoon:
    'Flat cartoon illustration: bold clean outlines, vibrant colors, simple storybook style.',
  photorealistic:
    'Photorealistic cinematic photograph: natural lighting, shallow depth of field, high detail.'
}

/**
 * Build the full image prompt for a story scene. The style directive keeps
 * every image in a story visually consistent; "no text" avoids garbled
 * captions baked into the image.
 */
export function buildSceneImagePrompt(scenePrompt: string, style: ImageStyle = 'cartoon'): string {
  const directive = STYLE_DIRECTIVES[style] ?? STYLE_DIRECTIVES.cartoon
  return `${directive} No text, words, or letters in the image. Scene: ${scenePrompt.trim()}`
}

/** True when the config has enough to attempt a generation. */
export function isImageProviderConfigured(config: ImageProviderConfig): boolean {
  switch (config.provider) {
    case 'openai':
      return !!config.apiKey
    case 'gemini':
      return !!config.apiKey
    case 'custom':
      return !!config.baseUrl && !!config.model
    default:
      return false
  }
}

/** Generate one image. Resolves to a data URL (data:image/...;base64,...). */
export async function generateImage(prompt: string, config: ImageProviderConfig): Promise<string> {
  switch (config.provider) {
    case 'openai':
      return generateOpenAICompatibleImage(prompt, 'https://api.openai.com/v1', config)
    case 'gemini':
      return generateGeminiImage(prompt, config)
    case 'custom':
      if (!config.baseUrl) throw new Error('No base URL configured for the custom image endpoint')
      return generateOpenAICompatibleImage(prompt, normalizeImageBaseUrl(config.baseUrl), config)
    default:
      throw new Error(`Unknown image provider: ${String(config.provider)}`)
  }
}

// ─── OpenAI + OpenAI-compatible (/images/generations) ────────────────────────

async function generateOpenAICompatibleImage(
  prompt: string,
  baseUrl: string,
  config: ImageProviderConfig
): Promise<string> {
  const model = config.model || 'gpt-image-1'
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    // Custom endpoints are typically self-hosted (CPU LocalAI etc.) where
    // 1024px is impractically slow — default smaller there.
    size: config.size || (config.provider === 'custom' ? '512x512' : '1024x1024')
  }
  // gpt-image models always return b64_json and reject response_format;
  // dall-e models need it explicitly to avoid a URL response.
  if (model.startsWith('dall-e')) body.response_format = 'b64_json'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  const response = await fetchWithTimeout(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(`Image API error (${response.status}): ${await response.text()}`)
  }
  const data = await response.json()
  const item = data?.data?.[0]
  if (!item) throw new Error('Image API returned no image data')

  if (typeof item.b64_json === 'string' && item.b64_json) {
    return `data:image/png;base64,${item.b64_json}`
  }
  if (typeof item.url === 'string' && item.url) {
    return fetchAsDataUrl(item.url)
  }
  throw new Error('Image API returned neither b64_json nor a URL')
}

// ─── Google Imagen (:predict) ────────────────────────────────────────────────

async function generateGeminiImage(prompt: string, config: ImageProviderConfig): Promise<string> {
  if (!config.apiKey) throw new Error('A Google API key is required for Imagen')
  const model = config.model || 'imagen-4.0-fast-generate-001'
  const aspectRatio = config.size || '4:3'

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio }
      })
    }
  )
  if (!response.ok) {
    throw new Error(`Imagen API error (${response.status}): ${await response.text()}`)
  }
  const data = await response.json()
  const prediction = data?.predictions?.[0]
  const b64 = prediction?.bytesBase64Encoded
  if (typeof b64 !== 'string' || !b64) throw new Error('Imagen returned no image')
  const mime = typeof prediction?.mimeType === 'string' ? prediction.mimeType : 'image/png'
  return `data:${mime};base64,${b64}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip trailing slashes so `${base}/images/generations` is well-formed. */
export function normalizeImageBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

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
      throw new Error(`Image request timed out after ${timeoutMs / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Download an image URL and return it as a data URL (avoids expiring URLs). */
async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, { method: 'GET', headers: {} }, 60_000)
  if (!response.ok) throw new Error(`Could not download image (${response.status})`)
  const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png'
  const buffer = await response.arrayBuffer()
  return `data:${mime};base64,${arrayBufferToBase64(buffer)}`
}

/** ArrayBuffer → base64 without Node's Buffer (the renderer has no Buffer). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
