/**
 * Lightweight structural checks for the story editor.
 *
 * These are advisory, not a full Ink validator. Compilation remains the source
 * of truth for syntax, missing divert targets, and undeclared variables. This
 * module catches the common authoring mistakes the compiler accepts silently:
 * dead ends, unreachable passages, empty choices, and broken tags.
 *
 * Reachability treats every choice and divert as a possible edge. That avoids
 * false positives with conditional branches; it can miss paths that variables
 * make unreachable at runtime. Advanced Ink (stitches, threads, functions,
 * lists) is reported as best-effort.
 */

import { parseInkSource, type InkKnot } from './inkParser.js'

export type StoryIssueSeverity = 'error' | 'warning' | 'info'

export interface StoryIssue {
  severity: StoryIssueSeverity
  code: string
  message: string
  knotId?: string
  /** 1-based line in the Ink source, when known. */
  line?: number
}

export interface StoryLintStats {
  nodes: number
  choices: number
  endings: number
  variables: number
}

export interface StoryLintResult {
  issues: StoryIssue[]
  stats: StoryLintStats
}

const SEVERITY_ORDER: Record<StoryIssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2
}

function lineOf(knot: InkKnot): number {
  return knot.startLine + 1
}

function firstLineMatching(lines: string[], pattern: RegExp): number | undefined {
  const index = lines.findIndex((line) => pattern.test(line))
  return index === -1 ? undefined : index + 1
}

/** Structural checks for the editor. Pure and synchronous. */
export function lintInk(source: string): StoryLintResult {
  const parsed = parseInkSource(source)
  const lines = source.split('\n')
  const issues: StoryIssue[] = []
  const knotIds = new Set(parsed.knots.map((k) => k.id))

  // Duplicate knot names make diverts and the graph ambiguous.
  const counts = new Map<string, number>()
  for (const knot of parsed.knots) counts.set(knot.id, (counts.get(knot.id) ?? 0) + 1)
  for (const [id, count] of counts) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'duplicate-knot',
        message: `Passage "${id}" is declared ${count} times.`,
        knotId: id
      })
    }
  }

  // Start passage. ensureStartDivert falls back to the first knot, so a
  // missing top-level divert is informational rather than fatal.
  let start = parsed.topLevelDivert
  if (!start && parsed.knots.length > 0) {
    issues.push({
      severity: 'info',
      code: 'no-start-divert',
      message: 'No top-level divert; the compiler will start at the first passage.',
      line: firstLineMatching(lines, /^===\s*\w+/)
    })
    start = parsed.knots[0].id
  }
  if (start && !knotIds.has(start)) {
    issues.push({
      severity: 'error',
      code: 'missing-start-target',
      message: `The top-level divert points to a missing passage: "${start}".`,
      line: firstLineMatching(lines, /^->\s*\w+/)
    })
  }

  // Reachability: all choices + plain diverts are possible edges.
  const reachable = new Set<string>()
  if (start && knotIds.has(start)) {
    const queue = [start]
    reachable.add(start)
    while (queue.length > 0) {
      const id = queue.shift()!
      const knot = parsed.knots.find((k) => k.id === id)
      if (!knot) continue
      const targets: string[] = knot.choices.map((c) => c.target)
      if (knot.nextTarget) targets.push(knot.nextTarget)
      for (const target of targets) {
        if (!target || !knotIds.has(target) || reachable.has(target)) continue
        reachable.add(target)
        queue.push(target)
      }
    }
  }

  for (const knot of parsed.knots) {
    if (start && !reachable.has(knot.id)) {
      issues.push({
        severity: 'warning',
        code: 'unreachable-knot',
        message: `Passage "${knot.id}" is never reached from the start passage.`,
        knotId: knot.id,
        line: lineOf(knot)
      })
    }

    if (reachable.has(knot.id) && knot.choices.length === 0 && !knot.nextTarget && !knot.endingType) {
      issues.push({
        severity: 'warning',
        code: 'dead-end',
        message: `Passage "${knot.id}" has no choices, divert, END/DONE, or # ENDING tag; the story will stop here.`,
        knotId: knot.id,
        line: lineOf(knot)
      })
    }

    for (let i = 0; i < knot.choices.length; i++) {
      const choice = knot.choices[i]
      if (!choice.target) {
        issues.push({
          severity: 'warning',
          code: 'empty-choice',
          message: `Choice ${i + 1} in "${knot.id}" has no divert target.`,
          knotId: knot.id,
          line: lineOf(knot)
        })
      }
    }

    if (knot.imagePath && !/^(data:|https?:)/i.test(knot.imagePath)) {
      issues.push({
        severity: 'warning',
        code: 'broken-image-tag',
        message: `# IMAGE in "${knot.id}" is not a data: or http(s): URL, so previews and exports cannot render it.`,
        knotId: knot.id,
        line: lineOf(knot)
      })
    }

    const timerTag = knot.tags.find((tag) => /^TIMER:/i.test(tag))
    if (timerTag && !/^TIMER:\s*\d+/i.test(timerTag)) {
      issues.push({
        severity: 'warning',
        code: 'invalid-timer',
        message: `# ${timerTag} in "${knot.id}" is not a whole number of seconds.`,
        knotId: knot.id,
        line: lineOf(knot)
      })
    }
  }

  // Advanced constructs are legal Ink but outside the graph's simple model.
  const advanced = [
    { pattern: /^\s*=\s+\w/m, label: 'stitches' },
    { pattern: /^===\s*function\b/m, label: 'functions' },
    { pattern: /^\s*LIST\s/m, label: 'lists' },
    { pattern: /->->/, label: 'tunnels' },
    { pattern: /^\s*<-/m, label: 'threads' },
    { pattern: /^\s*~ return\b/m, label: 'function returns' },
    { pattern: /^\s*(INCLUDE|EXTERNAL)\s/m, label: 'includes/externals' }
  ]
  const detected = advanced.filter((entry) => entry.pattern.test(source))
  if (detected.length > 0) {
    issues.push({
      severity: 'info',
      code: 'advanced-ink',
      message: `Advanced Ink detected (${detected.map((d) => d.label).join(', ')}); graph and structural checks are best-effort.`
    })
  }

  issues.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.line ?? 0) - (b.line ?? 0)
  )

  return {
    issues,
    stats: {
      nodes: parsed.knots.length,
      choices: parsed.knots.reduce((sum, knot) => sum + knot.choices.length, 0),
      endings: parsed.knots.filter((knot) => !!knot.endingType).length,
      variables: parsed.variables.length
    }
  }
}

/** Count issues by severity, for compact UI summaries. */
export function countIssues(issues: StoryIssue[]): Record<StoryIssueSeverity, number> {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.severity]++
      return counts
    },
    { error: 0, warning: 0, info: 0 }
  )
}
