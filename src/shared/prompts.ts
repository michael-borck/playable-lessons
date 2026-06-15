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

=== END ===`
}
