import { describe, it, expect } from 'vitest'
import { exportScorm } from './scormExporter'

const STATEFUL_INK = `VAR trust = 0
-> start
=== start ===
Hello.
~ trust = trust + 1
{ trust > 0: You feel welcome. }
* [Go on] -> DONE
`

describe('exportScorm', () => {
  it('packages the story with a SCORM 1.2 manifest', async () => {
    const bytes = await exportScorm(STATEFUL_INK, 'A <Lesson>')
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])

    const text = new TextDecoder('latin1').decode(bytes)
    expect(text).toContain('imsmanifest.xml')
    expect(text).toContain('index.html')
    expect(text).toContain('ADL SCORM')
    expect(text).toContain('schemaversion>1.2')
    expect(text).toContain('A &lt;Lesson&gt;')
  })

  it('wraps the player with the SCORM API calls (works for stateful stories)', async () => {
    const text = new TextDecoder('latin1').decode(await exportScorm(STATEFUL_INK, 'T'))
    expect(text).toContain('LMSInitialize')
    expect(text).toContain("cmi.core.lesson_status")
    expect(text).toContain("'completed'")
    expect(text).toContain('new inkjs.Story')
  })
})
