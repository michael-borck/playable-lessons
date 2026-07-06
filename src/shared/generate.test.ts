import { describe, it, expect } from 'vitest'
import { extractInk, generateInk, extractJson, generateFlashcards, generateQuiz, generateSummary, generateAiTask, generateCaseStudy, generatePlan, applyPlan, quizLetter, type PlanResult } from './generate'
import { storyPrompts } from './prompts'
import type { ProviderConfig, AIMessage } from './aiClient'

describe('storyPrompts', () => {
  it('defaults to the stateful prompts, which ask for variables', () => {
    const sp = storyPrompts()
    expect(sp.system).toContain('VAR')
    expect(sp.outline).toContain('"variables"')
    expect(sp.inkGeneration).toContain('conditional')
  })

  it('branching prompts forbid variables and conditionals everywhere', () => {
    const sp = storyPrompts('branching')
    expect(sp.system).toContain('PURE BRANCHING')
    expect(sp.system).toContain('Do NOT declare or use variables')
    expect(sp.outline).not.toContain('"variables"')
    expect(sp.inkGeneration).toContain('Do NOT use variables')
    expect(sp.inkSyntaxRef).toContain('no variables')
    // The syntax reference must not teach declaration/assignment/conditional syntax
    // (outside the explicit FORBIDDEN list).
    expect(sp.inkSyntaxRef.split('FORBIDDEN')[0]).not.toMatch(/^VAR |~ |\{ ?\w+ ?[><]/m)
  })
})

describe('extractInk', () => {
  it('prefers a ```ink fenced block', () => {
    const raw = 'Here you go:\n```ink\n=== start ===\nHi.\n-> END\n```\nEnjoy!'
    expect(extractInk(raw)).toBe('=== start ===\nHi.\n-> END')
  })

  it('falls back to any fenced block', () => {
    expect(extractInk('```\n=== start ===\n-> END\n```')).toBe('=== start ===\n-> END')
  })

  it('falls back to the trimmed raw text when unfenced', () => {
    expect(extractInk('  === start ===\n-> END  ')).toBe('=== start ===\n-> END')
  })
})

describe('generateInk', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }
  const VALID = '```ink\n=== start ===\nThe lesson begins.\n* [Continue] -> conclusion\n=== conclusion ===\nWell done.\n# ENDING: good\n-> END\n```'

  it('runs the pipeline with an injected transport and returns compiled JSON', async () => {
    const calls: number = 0
    const result = await generateInk(
      { inputMode: 'topic', inputText: 'Photosynthesis basics', storyLength: 'short' },
      config,
      { call: async () => VALID }
    )
    expect(result.inkSource).toContain('=== start ===')
    expect(() => JSON.parse(result.compiledJson)).not.toThrow()
    void calls
  })

  it('sends pure-branching prompts to the model when branchingStyle is "branching"', async () => {
    const systems: string[] = []
    await generateInk(
      { inputMode: 'topic', inputText: 'x', branchingStyle: 'branching' },
      config,
      {
        call: async (messages) => {
          systems.push(messages.find((m) => m.role === 'system')?.content ?? '')
          return VALID
        }
      }
    )
    expect(systems.length).toBeGreaterThan(0)
    for (const s of systems) {
      expect(s).toContain('PURE BRANCHING')
    }
  })

  it('sends stateful prompts by default', async () => {
    const systems: string[] = []
    await generateInk({ inputMode: 'topic', inputText: 'x' }, config, {
      call: async (messages) => {
        systems.push(messages.find((m) => m.role === 'system')?.content ?? '')
        return VALID
      }
    })
    for (const s of systems) {
      expect(s).toContain('Track relevant variables')
    }
  })

  it('retries compilation with AI fixes and gives up after maxCompileRetries', async () => {
    let n = 0
    const call = async () => {
      n++
      // Always return Ink that references a missing knot -> never compiles.
      return '```ink\n=== start ===\n-> nonexistent\n```'
    }
    await expect(
      generateInk({ inputMode: 'topic', inputText: 'x' }, config, { call, maxCompileRetries: 2 })
    ).rejects.toThrow(/Failed to compile/)
    expect(n).toBeGreaterThanOrEqual(2) // outline + ink + review + at least one fix attempt
  })
})

describe('extractJson', () => {
  it('parses a ```json fenced block', () => {
    const raw = 'Sure!\n```json\n{"a":1,"b":"x"}\n```'
    expect(extractJson(raw)).toEqual({ a: 1, b: 'x' })
  })

  it('parses raw JSON surrounded by prose via the outermost object span', () => {
    expect(extractJson('Here you go: {"ok":true} done')).toEqual({ ok: true })
  })

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow(/Could not parse JSON/)
  })
})

describe('generateFlashcards', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('parses a JSON deck from the AI response and keeps raw for export', async () => {
    const deck =
      '```json\n{"deckTitle":"Photosynthesis","cards":[{"front":"F1","back":"B1","tag":"t"},{"front":"F2","back":"B2"}]}\n```'
    const result = await generateFlashcards(
      { inputMode: 'topic', inputText: 'photosynthesis', cardCount: 5 },
      config,
      { call: async () => deck }
    )
    expect(result.deckTitle).toBe('Photosynthesis')
    expect(result.cards).toHaveLength(2)
    expect(result.cards[0]).toEqual({ front: 'F1', back: 'B1', tag: 't' })
    expect(result.cards[1]).toEqual({ front: 'F2', back: 'B2' })
    expect(result.raw).toBe(deck)
  })

  it('drops cards missing a usable front/back, keeping the rest', async () => {
    const deck = '{"cards":[{"front":"F","back":"B"},{"front":"","back":"x"},{"back":"y"}]}'
    const result = await generateFlashcards(
      { inputMode: 'topic', inputText: 'x' },
      config,
      { call: async () => deck }
    )
    expect(result.cards).toEqual([{ front: 'F', back: 'B' }])
  })

  it('strips empty hint/tag strings rather than keeping them', async () => {
    const deck = '{"cards":[{"front":"F","back":"B","hint":"   ","tag":""}]}'
    const result = await generateFlashcards(
      { inputMode: 'topic', inputText: 'x' },
      config,
      { call: async () => deck }
    )
    expect(result.cards[0]).toEqual({ front: 'F', back: 'B' })
  })

  it('throws when no usable cards are returned', async () => {
    await expect(
      generateFlashcards({ inputMode: 'topic', inputText: 'x' }, config, {
        call: async () => '{"cards":[]}'
      })
    ).rejects.toThrow(/no usable flashcards/)
  })

  it('throws when the response is not JSON', async () => {
    await expect(
      generateFlashcards({ inputMode: 'topic', inputText: 'x' }, config, {
        call: async () => 'nope, just text'
      })
    ).rejects.toThrow(/Could not parse JSON/)
  })
})

describe('quizLetter', () => {
  it('maps the first indices to A..J, then falls back to a 1-based number', () => {
    expect(quizLetter(0)).toBe('A')
    expect(quizLetter(1)).toBe('B')
    expect(quizLetter(9)).toBe('J')
    expect(quizLetter(12)).toBe('13') // beyond the 10-letter table
  })
})

describe('generateQuiz', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('parses a JSON quiz from the AI response and keeps raw', async () => {
    const deck =
      '```json\n{"quizTitle":"Basics","questions":[{"stem":"2+2?","options":["3","4","5"],"correctIndex":1,"explanation":"arithmetic"},{"stem":"Capital of France?","options":["Berlin","Paris"],"correctIndex":1}]}\n```'
    const result = await generateQuiz(
      { inputMode: 'topic', inputText: 'math+geo', questionCount: 5 },
      config,
      { call: async () => deck }
    )
    expect(result.quizTitle).toBe('Basics')
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]).toEqual({
      stem: '2+2?',
      options: ['3', '4', '5'],
      correctIndex: 1,
      explanation: 'arithmetic'
    })
    expect(result.questions[1]).toEqual({
      stem: 'Capital of France?',
      options: ['Berlin', 'Paris'],
      correctIndex: 1
    })
    expect(result.raw).toBe(deck)
  })

  it('drops questions with an out-of-range correctIndex', async () => {
    const deck =
      '{"questions":[{"stem":"bad","options":["a","b"],"correctIndex":5},{"stem":"good","options":["c","d"],"correctIndex":0}]}'
    const result = await generateQuiz({ inputMode: 'topic', inputText: 'x' }, config, {
      call: async () => deck
    })
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].stem).toBe('good')
  })

  it('drops questions with fewer than 2 options', async () => {
    const deck =
      '{"questions":[{"stem":"solo","options":["only"],"correctIndex":0},{"stem":"pair","options":["a","b"],"correctIndex":0}]}'
    const result = await generateQuiz({ inputMode: 'topic', inputText: 'x' }, config, {
      call: async () => deck
    })
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].stem).toBe('pair')
  })

  it('throws when no usable questions are returned', async () => {
    await expect(
      generateQuiz({ inputMode: 'topic', inputText: 'x' }, config, {
        call: async () => '{"questions":[]}'
      })
    ).rejects.toThrow(/no usable quiz questions/)
  })

  it('throws when the response is not JSON', async () => {
    await expect(
      generateQuiz({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => 'nope' })
    ).rejects.toThrow(/Could not parse JSON/)
  })
})

describe('generateSummary', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('parses a JSON summary from the AI response and keeps raw', async () => {
    const deck =
      '```json\n{"title":"Basics","overview":"An overview.","keyPoints":["p1","p2"],"glossary":[{"term":"T","definition":"D"}]}\n```'
    const result = await generateSummary(
      { inputMode: 'topic', inputText: 'x', keyPointCount: 5 },
      config,
      { call: async () => deck }
    )
    expect(result.title).toBe('Basics')
    expect(result.overview).toBe('An overview.')
    expect(result.keyPoints).toEqual(['p1', 'p2'])
    expect(result.glossary).toEqual([{ term: 'T', definition: 'D' }])
    expect(result.raw).toBe(deck)
  })

  it('drops empty key points and invalid glossary entries', async () => {
    const deck =
      '{"keyPoints":["ok","","   "],"glossary":[{"term":"T","definition":"D"},{"term":"X","definition":""},{"definition":"nope"}]}'
    const result = await generateSummary({ inputMode: 'topic', inputText: 'x' }, config, {
      call: async () => deck
    })
    expect(result.keyPoints).toEqual(['ok'])
    expect(result.glossary).toEqual([{ term: 'T', definition: 'D' }])
  })

  it('throws when no usable content is returned', async () => {
    await expect(
      generateSummary({ inputMode: 'topic', inputText: 'x' }, config, {
        call: async () => '{"keyPoints":[],"overview":""}'
      })
    ).rejects.toThrow(/no usable summary/)
  })

  it('throws when the response is not JSON', async () => {
    await expect(
      generateSummary({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => 'nope' })
    ).rejects.toThrow(/Could not parse JSON/)
  })
})

describe('generateAiTask', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('parses a JSON task set and keeps raw', async () => {
    const deck =
      '```json\n{"title":"Tasks","tasks":[{"scenario":"S","brief":"B","deliverable":"D","loadBearingSpecifics":[{"detail":"d","whyGenericAnswersMissIt":"w"}],"rubric":[{"criterion":"c","description":"e"}],"whyItWorks":"W"}]}\n```'
    const result = await generateAiTask(
      { inputMode: 'topic', inputText: 'x', taskCount: 2 },
      config,
      { call: async () => deck }
    )
    expect(result.title).toBe('Tasks')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].scenario).toBe('S')
    expect(result.tasks[0].loadBearingSpecifics).toEqual([{ detail: 'd', whyGenericAnswersMissIt: 'w' }])
    expect(result.tasks[0].rubric).toEqual([{ criterion: 'c', description: 'e' }])
    expect(result.raw).toBe(deck)
  })

  it('drops tasks missing required fields or with no specifics/rubric', async () => {
    const deck =
      '{"tasks":[' +
      '{"scenario":"S","brief":"B","deliverable":"","whyItWorks":"W","loadBearingSpecifics":[{"detail":"d","whyGenericAnswersMissIt":"w"}],"rubric":[{"criterion":"c","description":"e"}]},' +
      '{"scenario":"S2","brief":"B2","deliverable":"D2","whyItWorks":"W2","loadBearingSpecifics":[],"rubric":[{"criterion":"c","description":"e"}]},' +
      '{"scenario":"S3","brief":"B3","deliverable":"D3","whyItWorks":"W3","loadBearingSpecifics":[{"detail":"d","whyGenericAnswersMissIt":"w"}],"rubric":[{"criterion":"c","description":"e"}]}' +
      ']}'
    const result = await generateAiTask({ inputMode: 'topic', inputText: 'x' }, config, {
      call: async () => deck
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].scenario).toBe('S3')
  })

  it('throws when no usable tasks are returned', async () => {
    await expect(
      generateAiTask({ inputMode: 'topic', inputText: 'x' }, config, {
        call: async () => '{"tasks":[]}'
      })
    ).rejects.toThrow(/no usable AI-collaboration tasks/)
  })

  it('throws when the response is not JSON', async () => {
    await expect(
      generateAiTask({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => 'nope' })
    ).rejects.toThrow(/Could not parse JSON/)
  })
})

describe('generateCaseStudy', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('parses a complete case study and keeps raw', async () => {
    const deck =
      '```json\n{"title":"CS","protagonist":"P","situation":"S","keyFacts":["f1","f2"],"conflict":"C","decisionPoints":["d"],"discussionQuestions":["q"],"narrative":"The prose."}\n```'
    const result = await generateCaseStudy(
      { inputMode: 'topic', inputText: 'x', depth: 'complete' },
      config,
      { call: async () => deck }
    )
    expect(result.title).toBe('CS')
    expect(result.caseStudy.protagonist).toBe('P')
    expect(result.caseStudy.keyFacts).toEqual(['f1', 'f2'])
    expect(result.caseStudy.narrative).toBe('The prose.')
    expect(result.raw).toBe(deck)
  })

  it('omits narrative when absent (idea/outline depth)', async () => {
    const deck = '{"title":"I","situation":"S","conflict":"C","keyFacts":["f"]}'
    const result = await generateCaseStudy(
      { inputMode: 'topic', inputText: 'x', depth: 'idea' },
      config,
      { call: async () => deck }
    )
    expect(result.caseStudy.narrative).toBeUndefined()
    expect(result.caseStudy.situation).toBe('S')
  })

  it('throws when no usable content is returned', async () => {
    await expect(
      generateCaseStudy({ inputMode: 'topic', inputText: 'x' }, config, {
        call: async () => '{"title":"x"}'
      })
    ).rejects.toThrow(/no usable case study/)
  })

  it('throws when the response is not JSON', async () => {
    await expect(
      generateCaseStudy({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => 'nope' })
    ).rejects.toThrow(/Could not parse JSON/)
  })
})

describe('generatePlan', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('parses a plan and keeps raw', async () => {
    const deck =
      '```json\n{"title":"T","summary":"S","recommendations":[{"target":"quiz","rationale":"r","count":5},{"target":"summary","rationale":"r2"}]}\n```'
    const result = await generatePlan({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => deck })
    expect(result.title).toBe('T')
    expect(result.summary).toBe('S')
    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations[0]).toEqual({ target: 'quiz', rationale: 'r', count: 5 })
    expect(result.recommendations[1]).toEqual({ target: 'summary', rationale: 'r2' })
    expect(result.raw).toBe(deck)
  })

  it('drops recommendations with invalid targets or missing rationale', async () => {
    const deck =
      '{"recommendations":[{"target":"bogus","rationale":"r"},{"target":"quiz","rationale":""},{"target":"summary","rationale":"ok"}]}'
    const result = await generatePlan({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => deck })
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].target).toBe('summary')
  })

  it('throws when no usable recommendations are returned', async () => {
    await expect(
      generatePlan({ inputMode: 'topic', inputText: 'x' }, config, { call: async () => '{"recommendations":[]}' })
    ).rejects.toThrow(/no usable recommendations/)
  })
})

describe('applyPlan', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }

  it('generates each recommended target and assembles the artifacts', async () => {
    const plan: PlanResult = {
      title: 'T',
      summary: 'S',
      raw: '',
      recommendations: [
        { target: 'quiz', rationale: 'r' },
        { target: 'summary', rationale: 'r2' }
      ]
    }
    const call = async (messages: AIMessage[]) => {
      const body = messages.map((m) => m.content).join(' ')
      if (body.includes('multiple-choice')) {
        return '```json\n{"questions":[{"stem":"q","options":["a","b"],"correctIndex":0}]}\n```'
      }
      if (body.includes('study summary')) {
        return '```json\n{"title":"S","overview":"o","keyPoints":["p"]}\n```'
      }
      return '{}'
    }
    const artifacts = await applyPlan(plan, { inputMode: 'topic', inputText: 'x' }, config, { call })
    expect(artifacts.quiz?.questions).toHaveLength(1)
    expect(artifacts.summary?.keyPoints).toEqual(['p'])
    expect(artifacts.flashcards).toBeUndefined()
  })
})
