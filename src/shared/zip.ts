/**
 * Minimal ZIP writer shared by the H5P, SCORM, and EPUB exporters.
 *
 * Uses the "store" method (no compression) so the output is byte-identical
 * across runs and the EPUB `mimetype` entry can be first and uncompressed,
 * as the OCF spec requires.
 */

export interface ZipEntry {
  name: string
  /** Text (UTF-8) or raw bytes (e.g. an image). */
  data: string | Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Fixed DOS timestamp (2026-01-01 00:00) keeps output byte-identical across runs.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const DOS_TIME = 0

/** Assemble a store-only (uncompressed) zip. Entry order is preserved. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let pos = 0
    for (const p of parts) {
      out.set(p, pos)
      pos += p.length
    }
    return out
  }

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data
    const crc = crc32(data)
    // Local file header: flag bit 11 set = UTF-8 names; method 0 = store.
    const local = cat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0),
      name, data
    )
    central.push(
      cat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(DOS_TIME), u16(DOS_DATE),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset),
        name
      )
    )
    chunks.push(local)
    offset += local.length
  }

  const centralBlob = cat(...central)
  const eocd = cat(
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralBlob.length), u32(offset),
    u16(0)
  )
  return cat(...chunks, centralBlob, eocd)
}

/** Base64-encode package bytes (works in both Node and the browser). */
export function bytesToBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(e: string): string } } }).Buffer
  if (B) return B.from(bytes).toString('base64')
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Decode base64 to bytes (works in both Node and the browser). */
export function base64ToBytes(base64: string): Uint8Array {
  const B = (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }).Buffer
  if (B) return B.from(base64, 'base64')
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
