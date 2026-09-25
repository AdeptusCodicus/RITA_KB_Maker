import { NextRequest } from 'next/server';
import { getModel, AIModelError } from '@/lib/vertex';

const REFINE_KB_SYSTEM_PROMPT = `You are an expert corporate knowledge base editor for RITA, Ramcar's corporate AI assistant.

The user will provide an existing Markdown Knowledge Base and a set of refinement instructions (e.g., additions, rewrites, corrections, or structural updates).

Your task is to update and refine the Knowledge Base while strictly maintaining its RITA Hybrid KB format:
- # [Topic Title]
- *Category:*, *Version:*, *Generated:*, *Source:*, *RITA Compatibility:*
- ## Overview
- ## Workflows (each workflow has: *Type:*, *Trigger phrases:*, *Escalation point:*, *Action token:*, and atomic steps ending with "→ Wait for user confirmation before Step X.")
- ## FAQ Entries (each FAQ has: *Q:*, *A:*, *Tags:*, *Confidence:*, *Escalate if:*)
- ## Glossary (if applicable)
- ## Action Token Definitions (if applicable)
- ## RITA System Instructions — Addendum
- ## Quality Notes

Rules:
1. Apply ALL user refinement instructions precisely.
2. Maintain Google Chat text formatting: *single asterisks for bold*, _single underscores for italic_, - or * for bullets. Do NOT use hash headers inside workflow steps or FAQ answers.
3. Keep RITA's One-Step Rule: every procedural step must be followed by "→ Wait for user confirmation before Step X."
4. Preserve all existing factual details and action tokens that were not requested to be changed.
5. Output ONLY the complete, updated valid Markdown KB. No preamble, conversation, or commentary.`;

export async function POST(request: NextRequest) {
  try {
    const { markdown, instructions, originalText } = await request.json();

    if (!markdown || !instructions) {
      return new Response(
        JSON.stringify({ error: 'markdown and instructions are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let userPrompt = `Here is the current Knowledge Base:\n\n${markdown}\n\nUser Refinement Instructions:\n${instructions}`;
    if (originalText && (instructions.toLowerCase().includes('original') || instructions.toLowerCase().includes('source'))) {
      userPrompt += `\n\n(For reference, original document excerpt:)\n${originalText.slice(0, 1500)}`;
    }

    const model = getModel();
    const streamingResult = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: REFINE_KB_SYSTEM_PROMPT }] },
      enableThinking: false,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamingResult.stream) {
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}` + '\n\n')
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('KB refinement stream error:', err);
          const isCapacity =
            err instanceof AIModelError
              ? err.isCapacity
              : String(err).includes('503') ||
                String(err).includes('429') ||
                String(err).toLowerCase().includes('queue');
          const message =
            err instanceof AIModelError
              ? err.message
              : err instanceof Error
              ? err.message
              : String(err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: message,
                isCapacity,
                type: isCapacity ? 'CAPACITY_EXCEEDED' : 'REFINEMENT_ERROR',
                retryAfterSeconds: isCapacity ? 5 : undefined,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('KB refinement error:', error);
    const isCapacity =
      error instanceof AIModelError
        ? error.isCapacity
        : String(error).includes('503') ||
          String(error).includes('429') ||
          String(error).toLowerCase().includes('queue');
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
        : 'Refinement failed';

    return new Response(
      JSON.stringify({
        error: message,
        isCapacity,
        type: isCapacity ? 'CAPACITY_EXCEEDED' : 'REFINEMENT_ERROR',
        retryAfterSeconds: isCapacity ? 5 : undefined,
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
