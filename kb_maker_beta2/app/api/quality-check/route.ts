import { NextRequest, NextResponse } from "next/server";
import { getModel, AIModelError } from "@/lib/vertex";
import { parseQualityReport } from "@/lib/kb-quality";

const HYBRID_QUALITY_CHECK_SYSTEM_PROMPT = `You are a corporate knowledge base auditor for RITA (Ramcar Corporate AI Assistant).

Evaluate the provided hybrid Markdown Knowledge Base against the 6 criteria below. Return ONLY a valid JSON object. No prose, no markdown fences.

{
  "overall_score": <0–100 integer>,
  "grade": "<A|B|C|D|F>",
  "passed": <boolean>,
  "checks": [
    {
      "id": "structure",
      "name": "Document Structure & Metadata",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of H1 title, metadata block, and section hierarchy>"
    },
    {
      "id": "procedural_clarity",
      "name": "Procedural & One-Step Execution",
      "score": <0–20>,
      "max": 20,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of atomic actions and '→ Wait for user confirmation' rule>"
    },
    {
      "id": "action_tokens",
      "name": "Action Tokens & Escalation Logic",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of escalation triggers and action token formatting>"
    },
    {
      "id": "faq_quality",
      "name": "FAQ Entry Quality & Tagging",
      "score": <0–20>,
      "max": 20,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of Q&A phrasing, answer conciseness, and kebab-case tags>"
    },
    {
      "id": "system_instructions",
      "name": "RITA System Instructions Addendum",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of the scope addendum for RITA's instructions>"
    },
    {
      "id": "completeness",
      "name": "Completeness & Quality Notes",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of coverage, glossary, and quality notes>"
    }
  ],
  "suggestions": [
    "<actionable improvement 1>",
    "<actionable improvement 2>"
  ],
  "auto_fixed_issues": [
    "<issue automatically noted or corrected>"
  ]
}

---

SCORING CRITERIA:

1. Document Structure & Metadata (0–15):
- Clear H1 title and metadata block (Category, Version, Source, RITA Compatibility) (5 pts)
- Contains standard sections: ## Overview, ## Workflows, ## FAQ Entries, ## RITA System Instructions — Addendum, ## Quality Notes (10 pts)

2. Procedural & One-Step Execution (0–20):
- Discrete, atomic steps phrased in RITA's direct, warm voice (10 pts)
- Strict compliance with RITA One-Step Rule: every procedural step is followed by "→ Wait for user confirmation before Step X." (10 pts)

3. Action Tokens & Escalation Logic (0–15):
- Clear escalation point defined for each workflow (8 pts)
- Well-defined action tokens ([[TOKEN_NAME:category|param=value]]) or explicit "None" (7 pts)

4. FAQ Entry Quality & Tagging (0–20):
- Natural employee phrasing in Qs matching Google Chat tone (10 pts)
- Complete, self-contained answers (<=3 sentences) with kebab-case tags and confidence level (10 pts)

5. RITA System Instructions Addendum (0–15):
- Formal, unambiguous scope update paragraph ready to append to RITA's system prompt (15 pts)

6. Completeness & Quality Notes (0–15):
- Comprehensive coverage of source document content, with glossary if domain terms exist (10 pts)
- Honest Quality Notes detailing coverage gaps, ambiguities, and follow-up items (5 pts)`;

export async function POST(request: NextRequest) {
  try {
    const { markdown } = await request.json();
    if (!markdown) {
      return NextResponse.json(
        { error: "markdown is required" },
        { status: 400 },
      );
    }

    const model = getModel();
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `Evaluate this hybrid KB:\n\n${markdown}` }],
        },
      ],
      systemInstruction: {
        role: "system",
        parts: [{ text: HYBRID_QUALITY_CHECK_SYSTEM_PROMPT }],
      },
    });

    const responseText =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const report = parseQualityReport(responseText);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Quality check error:", error);
    const isCapacity =
      error instanceof AIModelError
        ? error.isCapacity
        : String(error).includes("503") ||
          String(error).includes("429") ||
          String(error).toLowerCase().includes("queue");
    const status =
      error instanceof AIModelError
        ? error.status
        : isCapacity
        ? 503
        : 500;
    const message =
      error instanceof AIModelError
        ? error.message
        : error instanceof Error
        ? error.message
        : "Quality check failed";

    return NextResponse.json(
      {
        error: message,
        isCapacity,
        type: isCapacity ? "CAPACITY_EXCEEDED" : "AUDIT_ERROR",
        retryAfterSeconds: isCapacity ? 5 : undefined,
      },
      { status },
    );
  }
}
