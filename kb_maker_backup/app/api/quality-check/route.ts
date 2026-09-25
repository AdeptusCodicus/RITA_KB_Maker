import { NextRequest, NextResponse } from "next/server";
import { getModel } from "@/lib/vertex";
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
      "name": "Document Structure & Title",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of H1 title, sections layout>"
    },
    {
      "id": "procedural_clarity",
      "name": "Step-by-Step Execution",
      "score": <0–20>,
      "max": 20,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of procedural steps clarity and completeness>"
    },
    {
      "id": "requirements_forms",
      "name": "Requirements & Approvals",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of forms, approvals, MAC/ID specs>"
    },
    {
      "id": "faq_quality",
      "name": "FAQ Entry Quality",
      "score": <0–20>,
      "max": 20,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of Q&As relevance and direct answers>"
    },
    {
      "id": "system_instructions",
      "name": "System Instructions Registry Line",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of registry entry formatting>"
    },
    {
      "id": "completeness",
      "name": "Completeness & Policy Coverage",
      "score": <0–15>,
      "max": 15,
      "status": "<pass|warn|fail>",
      "notes": "<string evaluation of notes and edge cases>"
    }
  ],
  "suggestions": [
    "<actionable improvement 1>",
    "<actionable improvement 2>"
  ],
  "auto_fixed_issues": [
    "<issue automatically corrected>"
  ]
}

---

SCORING CRITERIA:

1. Document Structure & Title (0–15):
- H1 title starts with "# KB_" and is descriptive (5 pts)
- Contains ## Overview, ## Requirements & Prerequisites, ## Step-by-Step Process, ## Frequently Asked Questions (FAQ), ## Notes & Policy Guidelines (10 pts)

2. Step-by-Step Execution (0–20):
- Procedural steps are logical, actionable, and numbered sequentially (10 pts)
- Steps clearly detail user actions and inputs (10 pts)

3. Requirements & Approvals (0–15):
- Forms (e.g. SRF 5.0), approvals, and contact emails (servicedesk@foodgroup.ph) are clearly documented (15 pts)

4. FAQ Entry Quality (0–20):
- FAQ entries use natural employee phrasing in headers (10 pts)
- Answers are self-contained, direct, and concise (10 pts)

5. System Instructions Registry Line (0–15):
- Code block contains exact registry bullet format: * \`KB_[Name].md\` — [Description] (15 pts)

6. Completeness & Policy Coverage (0–15):
- Clear notes regarding prohibitions, permissions, or caveats (15 pts)`;

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Quality check failed",
      },
      { status: 500 },
    );
  }
}
