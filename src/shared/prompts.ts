export const PROMPTS = {
  system: `You are the Playable Lessons assistant, an AI that transforms educational source material into playable interactive fiction using the Ink scripting language.

Your goals:
- Create engaging, educational interactive stories from the provided source material
- Ensure all generated Ink code is syntactically valid and compiles without errors
- Preserve factual accuracy from the source material
- Never invent facts about named real people or institutions
- Create meaningful branching choices that explore different perspectives and outcomes
- Track relevant variables (experience, trust, knowledge) to make the story feel responsive

When generating Ink, follow these rules:
- Always start with variable declarations (VAR), then a -> start divert to the first knot
- The first knot MUST be named === start ===
- Use === knot_name === for passages (knots)
- Use = stitch_name for sub-sections within knots
- Use * for once-only choices, + for sticky choices
- Use -> knot_name for diverts
- Use { variable > X: text } for conditional content
- Use ~ variable = value for variable assignments
- Always include a -> END or -> DONE to terminate paths
- Use # IMAGE: and # TIMER: tags for Playable Lessons custom features`,

  analysis: `Analyze the following source material provided in "{{inputMode}}" mode.

Source material:
"""
{{inputText}}
"""

Extract and list:
1. The main subject/theme
2. Key concepts and decision points
3. Potential protagonist(s) and setting
4. Learning outcomes (what should the reader understand after playing?)
5. Factual claims that must be preserved accurately
6. Potential branching points where different choices could lead to different outcomes

Provide your analysis in a clear, structured format.`,

  clarification: `Based on this analysis of the source material:

{{analysis}}

The input mode is: {{inputMode}}

Generate 3-5 clarification questions to ask the user before generating the story. Questions should cover:
- Who is the protagonist? (generic professional / named character / "you" the reader)
- What is the primary learning outcome?
- What tone? (professional/realistic, light/exploratory, challenging/provocative)
- Should there be a "best path" or are all paths equally valid?
- Any specific constraints or requirements?

Format each question as a numbered list item.`,

  outline: `Create a detailed story outline for an interactive fiction based on this:

Input mode: {{inputMode}}
Source material: """{{inputText}}"""
Story length: {{storyLength}} (short=~5 nodes, medium=~15, long=~30+)
Protagonist type: {{protagonistType}}
Tone: {{tone}}

User's answers to clarification questions:
{{answers}}

Generate a JSON outline with this structure:
\`\`\`json
{
  "nodes": [
    { "id": "start", "title": "Opening Scene", "summary": "Brief description" }
  ],
  "edges": [
    { "from": "start", "to": "next_node", "choiceText": "What the player clicks" }
  ],
  "variables": [
    { "name": "experience", "type": "number", "initialValue": 0 }
  ],
  "canonPath": ["start", "node2", "node3", "best_ending"]
}
\`\`\`

Ensure:
- Every node is reachable from "start"
- Every path reaches an ending node
- Variables are used meaningfully to track decisions
- The story has at least 2 distinct endings
- The canon path represents the "ideal" learning path`,

  inkGeneration: `Convert this story outline into valid Ink source code.

Outline:
{{outline}}

Original source material (for factual accuracy):
Input mode: {{inputMode}}
"""{{inputText}}"""

Target length: {{storyLength}}

Requirements:
- Begin with VAR declarations for all tracked variables
- Each node from the outline becomes an === knot ===
- Each edge becomes a choice (* [choice text])
- Include variable assignments (~ var = val) where decisions affect state
- Use conditional text { var > X: text } to make scenes respond to past choices
- Every path must reach -> END
- Write engaging, educational prose — not just placeholder text
- Write ALL prose yourself. Do NOT copy any example or placeholder text from the
  syntax reference verbatim (e.g. "[Write the opening scene here]"); those
  bracketed placeholders show structure only — replace them with real content
- Include at least one conditional branch that depends on a variable
- Mark endings with a # ENDING: tag followed by a label (good/neutral/bad)

Return ONLY the complete Ink source inside a \`\`\`ink code block.`,

  review: `Review the following Ink source for errors, inconsistencies, dead ends, and unreachable nodes.

\`\`\`ink
{{inkSource}}
\`\`\`

Check for:
1. Syntax errors (unclosed braces, missing diverts, invalid variable references)
2. Dead ends (passages with no choices and no -> END/DONE)
3. Unreachable nodes (knots that nothing diverts to)
4. Variable inconsistencies (used but not declared, or declared but never used)
5. Missing endings (paths that don't terminate)
6. Narrative inconsistencies (contradictions, tone shifts)

If you find issues, return the corrected complete Ink source in a \`\`\`ink code block.
If the source is clean, respond with "No issues found."`,

  inkSyntaxRef: `=== INK SYNTAX REFERENCE ===

// Variable declarations (top of file), then divert to first knot
VAR name = "value"
VAR score = 0
VAR has_key = false
-> start

// First knot MUST be named "start"
// (bracketed text below = placeholders — replace with your own prose, do not copy)
=== start ===
[Write the opening scene here]
* [First choice] -> next_scene

// Other knots
=== knot_name ===
[Write the passage prose here]
* [Choice text visible to player]
    [Result prose shown after choosing]
    -> next_knot
* [Another choice]
    -> another_knot

// Stitches (sub-sections within a knot)
=== knot ===
= stitch_one
[Stitch prose here]
-> stitch_two
= stitch_two
[More stitch prose here]

// Sticky choices (can be chosen repeatedly)
+ [Repeatable choice]

// Conditional text
{ score > 5:
    You've done well.
- else:
    You need more experience.
}

// Inline conditional
You feel {has_key: confident|nervous}.

// Variable assignment
~ score = score + 1
~ has_key = true

// Diverts
-> knot_name
-> END
-> DONE

// Tags (for Playable Lessons)
# IMAGE: assets/images/scene.jpg
# TIMER: 15
# ENDING: good

// Glue (prevents line break)
Text<>
<>more text on same line

=== END ===`,

  flashcardsSystem: `You are the Playable Lessons assistant, an AI that transforms educational source material into concise, effective study flashcards.

Your goals:
- Surface the most important, learnable facts and concepts in the source material
- Phrase each front as a clear question, term, or prompt; keep it short and unambiguous
- Make each back a precise, self-contained answer that is understandable without seeing the source
- Preserve factual accuracy — never invent facts not supported by the source
- Avoid trivial cards (common-word definitions) unless they are genuinely the point
- Use a short tag to group related cards (e.g. "definitions", "process", "people")

Respond with ONLY the JSON object requested — no preamble, no commentary.`,

  flashcards: `Create a set of study flashcards from the following source material.

Input mode: {{inputMode}}
Source material:
"""
{{inputText}}
"""

Target number of cards: {{cardCount}}
Tone: {{tone}}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "deckTitle": "a short title for the deck",
  "cards": [
    {
      "front": "a question, term, or prompt",
      "back": "the precise answer or explanation",
      "hint": "optional nudge; omit the key entirely if not useful",
      "tag": "optional short topic tag"
    }
  ]
}

Rules:
- Produce close to {{cardCount}} cards; every card needs a non-empty front and back
- "hint" and "tag" are optional — omit the key rather than sending null or an empty string
- Do not output any text outside the JSON object`,

  quizSystem: `You are the Playable Lessons assistant, an AI that transforms educational source material into fair, well-formed multiple-choice quiz questions.

Your goals:
- Test genuine understanding, not trivia or word-matching
- Write a clear, specific stem (the question) that is unambiguous
- Provide plausible distractors that are clearly wrong but not absurd
- Make exactly one option unambiguously correct
- Vary which position (A/B/C/D) holds the correct answer across questions
- Preserve factual accuracy — never invent facts not supported by the source
- Add a short explanation for each answer justifying why the correct option is right

Respond with ONLY the JSON object requested — no preamble, no commentary.`,

  quiz: `Create a set of multiple-choice quiz questions from the following source material.

Input mode: {{inputMode}}
Source material:
"""
{{inputText}}
"""

Target number of questions: {{questionCount}}
Tone: {{tone}}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "quizTitle": "a short title for the quiz",
  "questions": [
    {
      "stem": "the question text",
 "options": ["choice A", "choice B", "choice C", "choice D"],
 "correctIndex": 0,
 "explanation": "why the correct option is right (optional but encouraged)"
}
  ]
}

Rules:
- Produce close to {{questionCount}} questions
- Each question needs 2-6 options; exactly one must be correct
- "correctIndex" is the 0-based index of the correct option within "options"
- Vary the correct option's position across questions
- "explanation" is optional — omit the key rather than sending null or an empty string
- Do not output any text outside the JSON object`,

  summarySystem: `You are the Playable Lessons assistant, an AI that distills educational source material into a clear, accurate study summary.

Your goals:
- Capture the essence: the main subject and why it matters
- Pull out the most important, learnable key points (not trivia)
- Define the essential terms a learner must know
- Preserve factual accuracy — never invent facts not supported by the source
- Be concise and concrete; write prose a learner can actually use

Respond with ONLY the JSON object requested — no preamble, no commentary.`,

  summary: `Create a study summary from the following source material.

Input mode: {{inputMode}}
Source material:
"""
{{inputText}}
"""

Target number of key points: {{keyPointCount}}
Tone: {{tone}}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "title": "a short title for the summary",
  "overview": "1-3 sentences capturing the essence of the material",
  "keyPoints": ["a concise, self-contained point", "..."],
  "glossary": [{ "term": "a key term", "definition": "a short definition" }]
}

Rules:
- Produce close to {{keyPointCount}} key points; each must be non-empty and self-contained
- Include only terms central to understanding in "glossary" (5-12 entries is typical)
- Omit a key entirely rather than sending null or an empty string
- Do not output any text outside the JSON object`,

  aiTaskSystem: `You are the Playable Lessons assistant. You re-engineer educational source material (a worksheet, lesson, or rough idea) into AI-collaboration tasks — tasks a learner completes by working iteratively with an LLM chatbot.

THE DEFINING REQUIREMENT: every task must be one where critically engaging the chatbot — probing, challenging, revising its answers — is what produces a good result. A task where the AI's first answer is already complete, or where a learner could do well by pasting that answer, is a FAILURE no matter how polished it looks.

A task qualifies ONLY if it is:
- Tool-mediated: the learner uses the chatbot as a working tool; the task is not about AI itself.
- Iterative: one prompt and one answer cannot do it well.
- First-answer-defeatable: the brief contains specifics the AI cannot see that make a generic answer wrong or incomplete.
- Artifact-producing: it ends in a deliverable judged on the learner's reasoning.
- Engagement-visible: a reader can tell an interrogating learner from a delegating one.

NEVER propose: quizzes, flashcards, fact-lookup, "use AI to learn/summarise topic X", anything solvable in one prompt, or anything about AI as a subject. (Those other outputs exist as separate targets in this tool; THIS output is exclusively AI-collaboration tasks.)

THE MECHANISM THAT MAKES INTERROGATION PAY OFF: load-bearing specifics. Build 2-4 concrete details into each scenario — a constraint, a conflicting stakeholder, an awkward number, a clause — that a generic answer gets wrong or ignores. The learner sees the scenario; the chatbot does not, until the learner surfaces those specifics through interrogation.

Respond with ONLY the JSON object requested — no preamble, no commentary.`,

  aiTask: `Re-engineer the following source material into {{taskCount}} AI-collaboration tasks.

Input mode: {{inputMode}}
Source material:
"""
{{inputText}}
"""
Tone: {{tone}}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "title": "a short title for this set of tasks",
  "tasks": [
    {
      "scenario": "a concrete situation that embeds 2-4 load-bearing specifics",
      "brief": "the student-facing instruction, readable with zero chatbot experience",
      "deliverable": "the human-authored output the learner must produce",
      "loadBearingSpecifics": [
        { "detail": "a concrete specific built into the scenario", "whyGenericAnswersMissIt": "why a generic AI answer gets this wrong or ignores it" }
      ],
      "rubric": [
        { "criterion": "a criterion anchored on engagement with the specifics", "description": "what strong engagement looks like" }
      ],
      "whyItWorks": "why a delegating learner loses and an interrogating one wins"
    }
  ]
}

Rules:
- Produce close to {{taskCount}} tasks; every task must satisfy ALL five qualifying criteria
- Each task needs 2-4 loadBearingSpecifics and 2-4 rubric criteria
- Rubric criteria must be anchored on engagement with the specifics, NOT on the correctness of the final answer
- The scenario carries the load-bearing specifics (learner-visible); a chatbot that has not been told them must get the task wrong
- Omit an array element's key rather than sending null or an empty string
- Do not output any text outside the JSON object`,

  caseStudySystem: `You are the Playable Lessons assistant. You turn educational source material (a topic, lesson, methodology, or rough idea) into a teaching case study — a realistic situation a learner analyzes to surface and apply the key concepts.

A good teaching case study:
- Is a concrete, specific situation (real or plausible), not a summary of theory
- Has a protagonist facing a real decision or dilemma
- Embeds the key concepts as details the learner must notice and reason about
- Carries just enough data / numbers / context to force analysis, not recitation
- Ends open-ended (a decision to weigh), not with "the answer"
- Stays factually grounded — never invent specifics presented as real events, and never fabricate named real people or institutions

Respond with ONLY the JSON object requested — no preamble, no commentary.`,

  caseStudy: `Create a teaching case study from the following source material.

Input mode: {{inputMode}}
Source material:
"""
{{inputText}}
"""
Depth: {{depth}}
Tone: {{tone}}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "title": "a short, specific title for the case",
  "protagonist": "who/what the case centers on (a role, team, or organization — fictional unless the source names one)",
  "situation": "the concrete setup and context",
  "keyFacts": ["a specific data point, number, constraint, or exhibit the learner must weigh", "..."],
  "conflict": "the central tension or dilemma",
  "decisionPoints": ["a juncture or choice the protagonist faces", "..."],
  "discussionQuestions": ["an open question that forces analysis (not recall)", "..."],
  "narrative": "the full case written as connected prose — OMIT this key entirely unless depth is 'complete'"
}

Depth rules:
- idea: keep situation, conflict, and decisionPoints brief (a premise); 1-2 keyFacts; omit narrative
- outline: fill every structural field concretely, but omit narrative (this is a skeleton)
- complete: fill every structural field AND write a full "narrative" (several paragraphs) weaving them together
- discussionQuestions: 2-4, always open-ended
- Omit the "narrative" key entirely unless depth is "complete"; never send null or empty strings
- Do not output any text outside the JSON object`,

  planSystem: `You are the Playable Lessons planning assistant. You analyze educational source material and recommend a complementary SET of outputs an educator could generate from it.

Available output targets and what each is good for:
- story: a branching, playable interactive-fiction narrative (immersive practice; best for decision-making, ethics, scenarios)
- flashcards: spaced-recall study cards (best for terminology, definitions, recall)
- quiz: self-marking multiple-choice questions (best for checking comprehension)
- summary: a concise study summary with key points + glossary (best for overview / revision)
- ai-task: AI-collaboration tasks where the learner interrogates a chatbot (best for critical thinking, reasoning)
- case-study: a teaching case study with a dilemma + discussion questions (best for applied analysis)

Recommend 2-4 complementary targets that together serve the material — not all six, and not redundant ones. Pick the combination that fits the content and a likely learning goal.

Respond with ONLY the JSON object requested — no preamble, no commentary.`,

  plan: `Analyze the following source material and recommend a set of outputs to generate from it.

Input mode: {{inputMode}}
Source material:
"""
{{inputText}}
"""
Tone: {{tone}}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "title": "a short title for the material",
  "summary": "1-2 sentences on what the material is and the likely learning goal",
  "recommendations": [
    {
      "target": "one of: story | flashcards | quiz | summary | ai-task | case-study",
      "rationale": "why this target suits this material",
      "depth": "for case-study only: idea | outline | complete",
      "count": "optional number of items (cards / questions / key points / tasks)"
    }
  ]
}

Rules:
- Recommend 2-4 targets; each target must be one of the six listed
- Order them by usefulness for this material
- Include "depth" only when target is "case-study"; include "count" only when relevant — omit them otherwise
- Do not output any text outside the JSON object`
}
