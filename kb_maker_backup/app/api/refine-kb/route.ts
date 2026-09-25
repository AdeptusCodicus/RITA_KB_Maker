import { NextRequest } from 'next/server';
import { getModel } from '@/lib/vertex';

const REFINE_KB_SYSTEM_PROMPT = `You are an expert corporate knowledge base editor. The user will provide an existing Markdown Knowledge Base and a set of refinement instructions (e.g., additions, rewrites, corrections, or structural changes).

Your task is to update and refine the Knowledge Base while strictly maintaining its Hybrid KB format:
- # KB_[Title] (Keep or update title if requested)
- ## Overview
- ## Requirements & Prerequisites
- ## Step-by-Step Process
- ## Frequently Asked Questions (FAQ)
- ## Notes & Policy Guidelines
- ## System Instructions Registry Line

Rules:
1. Apply ALL user instructions precisely.
2. Preserve all existing factual details that were not asked to be modified.
3. Output ONLY the complete, updated valid Markdown KB. No conversational intro or outro.`;

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
    if (originalText) {
      userPrompt += `\n\n(For reference, original document text:)\n${originalText.slice(0, 2000)}`;
    }

    const model = getModel();
    const streamingResult = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: REFINE_KB_SYSTEM_PROMPT }] },
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
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Refinement failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
