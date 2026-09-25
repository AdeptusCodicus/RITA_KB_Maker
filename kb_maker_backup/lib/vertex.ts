import { GoogleAuth } from 'google-auth-library';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'global';
const endpoint = process.env.MODEL_GARDEN_ENDPOINT ?? 'aiplatform.googleapis.com';
const modelName = process.env.VERTEX_MODEL ?? 'google/gemma-4-26b-a4b-it-maas';

/**
 * Interface representing a model runner so both Vertex AI SDK models
 * and Model Garden OpenAPI Service endpoints share a unified caller signature.
 */
export interface ModelRunner {
  generateContentStream(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { role: string; parts: Array<{ text: string }> };
  }): Promise<{ stream: AsyncIterable<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }> }>;

  generateContent(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { role: string; parts: Array<{ text: string }> };
  }): Promise<{ response: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } }>;
}

let _modelRunner: ModelRunner | null = null;
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

/**
 * Model Garden OpenAPI Chat Completions adapter using Application Default Credentials (ADC)
 */
class ModelGardenRunner implements ModelRunner {
  private async getAccessToken(): Promise<string> {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error('Failed to retrieve access token using Application Default Credentials (ADC).');
    }
    return tokenResponse.token;
  }

  async generateContentStream(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { role: string; parts: Array<{ text: string }> };
  }) {
    const token = await this.getAccessToken();
    const url = `https://${endpoint}/v1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;

    const messages = [];
    if (params.systemInstruction?.parts?.[0]?.text) {
      messages.push({
        role: 'system',
        content: params.systemInstruction.parts[0].text,
      });
    }

    for (const content of params.contents) {
      messages.push({
        role: content.role === 'user' ? 'user' : 'assistant',
        content: content.parts.map((p) => p.text).join('\n'),
      });
    }

    const payload = {
      model: modelName,
      stream: true,
      max_tokens: 128000,
      messages,
      chat_template_kwargs: {
        enable_thinking: true,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Model Garden API error (${res.status}): ${errText}`);
    }

    const bodyReader = res.body?.getReader();
    const decoder = new TextDecoder();

    async function* streamGenerator() {
      if (!bodyReader) return;
      let buffer = '';
      while (true) {
        const { value, done } = await bodyReader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') return;
            try {
              const parsed = JSON.parse(dataStr);
              const contentText = parsed.choices?.[0]?.delta?.content ?? '';
              if (contentText) {
                yield {
                  candidates: [
                    {
                      content: {
                        parts: [{ text: contentText }],
                      },
                    },
                  ],
                };
              }
            } catch {
              // Ignore non-JSON chunks
            }
          }
        }
      }
    }

    return { stream: streamGenerator() };
  }

  async generateContent(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { role: string; parts: Array<{ text: string }> };
  }) {
    const token = await this.getAccessToken();
    const url = `https://${endpoint}/v1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;

    const messages = [];
    if (params.systemInstruction?.parts?.[0]?.text) {
      messages.push({
        role: 'system',
        content: params.systemInstruction.parts[0].text,
      });
    }

    for (const content of params.contents) {
      messages.push({
        role: content.role === 'user' ? 'user' : 'assistant',
        content: content.parts.map((p) => p.text).join('\n'),
      });
    }

    const payload = {
      model: modelName,
      stream: false,
      max_tokens: 128000,
      messages,
      chat_template_kwargs: {
        enable_thinking: true,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Model Garden API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const contentText = data.choices?.[0]?.message?.content ?? '';

    return {
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: contentText }],
            },
          },
        ],
      },
    };
  }
}

/**
 * Adapter wrapping standard Vertex AI GenerativeModel
 */
class VertexAIRunner implements ModelRunner {
  private model: GenerativeModel;

  constructor(model: GenerativeModel) {
    this.model = model;
  }

  async generateContentStream(params: Parameters<GenerativeModel['generateContentStream']>[0]) {
    return this.model.generateContentStream(params);
  }

  async generateContent(params: Parameters<GenerativeModel['generateContent']>[0]) {
    return this.model.generateContent(params);
  }
}

export function getModel(): ModelRunner {
  if (_modelRunner) return _modelRunner;

  if (!project) {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT is not set. ' +
        'Please set it in your .env.local file or via `gcloud config set project <id>`.'
    );
  }

  // Use Model Garden API Service for Gemma 4 / MaaS endpoints or OpenAPI endpoints
  if (modelName.includes('gemma') || process.env.USE_MODEL_GARDEN === 'true') {
    _modelRunner = new ModelGardenRunner();
  } else {
    const vertexAI = new VertexAI({ project, location });
    const generativeModel = vertexAI.getGenerativeModel({ model: modelName });
    _modelRunner = new VertexAIRunner(generativeModel);
  }

  return _modelRunner;
}
