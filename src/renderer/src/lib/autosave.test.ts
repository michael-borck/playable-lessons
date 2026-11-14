import { describe, it, expect } from 'vitest'
import type { ProjectFull } from '../../../shared/project'
import { autosaveSignature, isMeaningfulProject } from './autosave'

const BASE: ProjectFull = {
  id: 'draft',
  name: 'Lesson',
  inputMode: 'topic',
  inputText: 'Some material',
  createdAt: 1,
  updatedAt: 2,
  inkSource: '-> start\n=== start ===\nHi.\n-> END\n'
}

describe('autosaveSignature', () => {
  it('ignores ids and timestamps', () => {
    expect(autosaveSignature({ ...BASE, id: 'other', createdAt: 99, updatedAt: 100 })).toBe(
      autosaveSignature(BASE)
    )
  })

  it('changes when content changes', () => {
    expect(autosaveSignature({ ...BASE, inkSource: '-> start\n=== start ===\nBye.\n-> END\n' })).not.toBe(
      autosaveSignature(BASE)
    )
  })
})

describe('isMeaningfulProject', () => {
  it('does not autosave an empty app', () => {
    expect(isMeaningfulProject({ ...BASE, name: '', inputText: '', inkSource: undefined })).toBe(false)
  })

  it('autosaves input, stories, and artifacts', () => {
    expect(isMeaningfulProject(BASE)).toBe(true)
    expect(isMeaningfulProject({ ...BASE, name: '', inputText: '', inkSource: 'x' })).toBe(true)
    expect(
      isMeaningfulProject({
        ...BASE,
        name: '',
        inputText: '',
        inkSource: undefined,
        activity: {
          title: 'A',
          instructions: '',
          activity: { kind: 'slider', statements: [{ text: 'x', lowLabel: 'Lo', highLabel: 'Hi', feedback: '' }], debrief: '' },
          raw: ''
        }
      })
    ).toBe(true)
  })
})
