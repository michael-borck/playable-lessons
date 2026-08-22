import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildSceneImagePrompt,
  generateImage,
  isImageProviderConfigured,
  normalizeImageBaseUrl,
  type ImageProviderConfig
} from './imageClient'

const PNG_B64 = 'iVBORw0KGgo='

/** A fetch stub returning a successful OpenAI-shaped b64 response. */
function stubFetchJson(body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status: 200 })
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildSceneImagePrompt', () => {
  it('prepends the cartoon style directive and forbids text', () => {
    const p = buildSceneImagePrompt('a nurse at a triage desk', 'cartoon')
    expect(p).toContain('cartoon')
    expect(p).toMatch(/no text/i)
    expect(p).toContain('Scene: a nurse at a triage desk')
  })

  it('uses the photorealistic directive for that style', () => {
    const p = buildSceneImagePrompt('a warehouse at dawn', 'photorealistic')
    expect(p).toContain('Photorealistic')
    expect(p).toContain('Scene: a warehouse at dawn')
  })

  it('defaults to cartoon for an unknown style', () => {
    const p = buildSceneImagePrompt('x', 'watercolor' as never)
    expect(p).toContain('cartoon')
  })
})

describe('isImageProviderConfigured', () => {
  it('requires an API key for openai and gemini', () => {
    expect(isImageProviderConfigured({ provider: 'openai' })).toBe(false)
    expect(isImageProviderConfigured({ provider: 'openai', apiKey: 'sk' })).toBe(true)
    expect(isImageProviderConfigured({ provider: 'gemini', apiKey: 'AIza' })).toBe(true)
  })

  it('requires a base URL and model for custom (key optional for local servers)', () => {
    expect(isImageProviderConfigured({ provider: 'custom' })).toBe(false)
    expect(isImageProviderConfigured({ provider: 'custom', baseUrl: 'http://localhost:8080/v1' })).toBe(false)
    expect(
      isImageProviderConfigured({ provider: 'custom', baseUrl: 'http://localhost:8080/v1', model: 'sdxl' })
    ).toBe(true)
  })
})

describe('normalizeImageBaseUrl', () => {
  it('strips trailing slashes', () => {
    expect(normalizeImageBaseUrl('http://localhost:8080/v1/')).toBe('http://localhost:8080/v1')
  })
})

describe('generateImage', () => {
  it('openai: posts to /images/generations and returns a data URL from b64_json', async () => {
    const calls = stubFetchJson({ data: [{ b64_json: PNG_B64 }] })
    const config: ImageProviderConfig = { provider: 'openai', apiKey: 'sk-test' }
    const dataUrl = await generateImage('a scene', config)

    expect(dataUrl).toBe(`data:image/png;base64,${PNG_B64}`)
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/generations')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toMatchObject({ model: 'gpt-image-1', prompt: 'a scene', n: 1, size: '1024x1024' })
    // gpt-image models always return b64 and reject response_format
    expect(body.response_format).toBeUndefined()
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('openai: dall-e models request b64_json explicitly', async () => {
    const calls = stubFetchJson({ data: [{ b64_json: PNG_B64 }] })
    await generateImage('a scene', { provider: 'openai', apiKey: 'sk', model: 'dall-e-3' })
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.response_format).toBe('b64_json')
  })

  it('openai: falls back to downloading a URL response', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71])
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === 'https://img.example/x.png') {
        return new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } })
      }
      return new Response(JSON.stringify({ data: [{ url: 'https://img.example/x.png' }] }), { status: 200 })
    })
    const dataUrl = await generateImage('a scene', { provider: 'openai', apiKey: 'sk' })
    expect(dataUrl).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...pngBytes))}`)
  })

  it('gemini: posts to the Imagen :predict endpoint with the API key header', async () => {
    const calls = stubFetchJson({ predictions: [{ bytesBase64Encoded: PNG_B64, mimeType: 'image/png' }] })
    const dataUrl = await generateImage('a scene', { provider: 'gemini', apiKey: 'AIza-test' })

    expect(dataUrl).toBe(`data:image/png;base64,${PNG_B64}`)
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict'
    )
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.instances).toEqual([{ prompt: 'a scene' }])
    expect(body.parameters).toMatchObject({ sampleCount: 1, aspectRatio: '4:3' })
    expect((calls[0].init?.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test')
  })

  it('custom: uses the configured base URL and works without a key', async () => {
    const calls = stubFetchJson({ data: [{ b64_json: PNG_B64 }] })
    const dataUrl = await generateImage('a scene', {
      provider: 'custom',
      baseUrl: 'http://localhost:8080/v1/',
      model: 'sdxl-base'
    })

    expect(dataUrl).toBe(`data:image/png;base64,${PNG_B64}`)
    expect(calls[0].url).toBe('http://localhost:8080/v1/images/generations')
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('custom: defaults to a CPU-friendly 512x512 (self-hosted generators are slow at 1024)', async () => {
    const calls = stubFetchJson({ data: [{ b64_json: PNG_B64 }] })
    await generateImage('a scene', { provider: 'custom', baseUrl: 'http://x/v1', model: 'm' })
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.size).toBe('512x512')
  })

  it('custom: honors an explicit size override', async () => {
    const calls = stubFetchJson({ data: [{ b64_json: PNG_B64 }] })
    await generateImage('a scene', {
      provider: 'custom',
      baseUrl: 'http://x/v1',
      model: 'm',
      size: '1024x1024'
    })
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.size).toBe('1024x1024')
  })

  it('throws a descriptive error when the API fails', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }))
    await expect(generateImage('a scene', { provider: 'openai', apiKey: 'bad' })).rejects.toThrow(
      /Image API error \(401\)/
    )
  })
})
