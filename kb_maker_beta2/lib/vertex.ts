import dns from 'dns';
import { execSync } from 'child_process';
import { GoogleAuth } from 'google-auth-library';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';

// Configure Node DNS to prefer IPv4 first on macOS/Linux to eliminate ENOTFOUND IPv6 glitches
try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch {
  // Ignore on older Node runtimes
}

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
    enableThinking?: boolean;
  }): Promise<{ stream: AsyncIterable<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }> }>;

  generateContent(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { role: string; parts: Array<{ text: string }> };
    enableThinking?: boolean;
  }): Promise<{ response: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } }>;
}

export interface AIErrorDetails {
  isCapacity: boolean;
  status: number;
  message: string;
  originalMessage: string;
  retryAfterSeconds?: number;
}

export class AIModelError extends Error {
  isCapacity: boolean;
  status: number;
  originalMessage: string;
  retryAfterSeconds: number;

  constructor(details: AIErrorDetails) {
    super(details.message);
    this.name = 'AIModelError';
    this.isCapacity = details.isCapacity;
    this.status = details.status;
    this.originalMessage = details.originalMessage;
    this.retryAfterSeconds = details.retryAfterSeconds ?? (details.isCapacity ? 5 : 0);
  }
}

export function classifyModelError(status: number, errText: string): AIModelError {
  let parsedMsg = errText;
  let isCapacity = status === 429 || status === 503;

  try {
    const json = JSON.parse(errText);
    if (json.error?.message) {
      parsedMsg = json.error.message;
    }
    if (
      json.error?.status === 'RESOURCE_EXHAUSTED' ||
      json.error?.status === 'UNAVAILABLE' ||
      json.error?.code === 429 ||
      json.error?.code === 503
    ) {
      isCapacity = true;
    }
  } catch {
    // Non-JSON response
  }

  const lower = (parsedMsg + ' ' + errText).toLowerCase();
  if (
    lower.includes('request queue is full') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('temporarily unavailable')
  ) {
    isCapacity = true;
  }

  let friendlyMessage: string;
  if (isCapacity) {
    friendlyMessage = 'Google AI request queue is currently at peak capacity. Your document and progress are preserved.';
  } else if (status === 401 || status === 403) {
    friendlyMessage = 'Google Cloud authentication or permission error. Please verify ADC credentials.';
  } else {
    friendlyMessage = `AI generation error (${status}): ${parsedMsg.slice(0, 150)}`;
  }

  return new AIModelError({
    isCapacity,
    status,
    message: friendlyMessage,
    originalMessage: errText,
    retryAfterSeconds: 5,
  });
}

let _modelRunner: ModelRunner | null = null;
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// In-memory token cache to prevent redundant network requests and DNS lookups
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;


/**
 * Model Garden OpenAPI Chat Completions adapter using Application Default Credentials (ADC)
 */
class ModelGardenRunner implements ModelRunner {
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    // 1. Return cached token if valid (tokens are valid for 1 hour; cache for 50 min)
    if (cachedAccessToken && now < tokenExpiresAt) {
      return cachedAccessToken;
    }

    // 2. Fetch via google-auth-library with retry logic
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        if (tokenResponse.token) {
          cachedAccessToken = tokenResponse.token;
          tokenExpiresAt = Date.now() + 50 * 60 * 1000;
          return tokenResponse.token;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[ADC] Token fetch attempt ${attempt}/3 failed (${err?.message || err}). Retrying...`);
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        }
      }
    }

    // 3. Fallback to local gcloud CLI if DNS / network to oauth2.googleapis.com failed
    try {
      console.info('[ADC] Attempting fallback to local gcloud CLI print-access-token...');
      const localToken = execSync(
        'gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token 2>/dev/null',
        { encoding: 'utf8', timeout: 6000 }
      ).trim();

      if (localToken && localToken.startsWith('ya29.')) {
        cachedAccessToken = localToken;
        tokenExpiresAt = Date.now() + 30 * 60 * 1000;
        console.info('[ADC] Successfully retrieved access token via local gcloud fallback.');
        return localToken;
      }
    } catch (cliErr) {
      console.error('[ADC] Local gcloud fallback failed:', cliErr);
    }

    throw new Error(
      `Failed to retrieve access token using Application Default Credentials (ADC): ${lastError?.message || lastError}`
    );
  }

  async generateContentStream(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { role: string; parts: Array<{ text: string }> };
    enableThinking?: boolean;
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

    const payload: Record<string, any> = {
      model: modelName,
      stream: true,
      max_tokens: 128000,
      messages,
    };

    if (params.enableThinking) {
      payload.chat_template_kwargs = {
        enable_thinking: true,
      };
    }

    const maxServerRetries = 2;
    let res: Response | null = null;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxServerRetries; attempt++) {
      if (attempt > 0) {
        console.warn(`[ModelGarden] Retrying streaming request (${attempt}/${maxServerRetries}) after queue/capacity error...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }

      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        break;
      }

      const errText = await res.text();
      const classifiedError = classifyModelError(res.status, errText);
      lastError = classifiedError;

      // Only retry if it is a transient capacity/queue error (429 or 503)
      if (!classifiedError.isCapacity || attempt === maxServerRetries) {
        throw classifiedError;
      }
    }

    if (!res || !res.ok) {
      throw lastError || new Error('Model Garden streaming connection failed.');
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
              const delta = parsed.choices?.[0]?.delta;
              const contentText = delta?.content ?? delta?.text ?? '';
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
    enableThinking?: boolean;
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

    const payload: Record<string, any> = {
      model: modelName,
      stream: false,
      max_tokens: 128000,
      messages,
    };

    if (params.enableThinking) {
      payload.chat_template_kwargs = {
        enable_thinking: true,
      };
    }

    const maxServerRetries = 2;
    let res: Response | null = null;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxServerRetries; attempt++) {
      if (attempt > 0) {
        console.warn(`[ModelGarden] Retrying request (${attempt}/${maxServerRetries}) after queue/capacity error...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }

      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        break;
      }

      const errText = await res.text();
      const classifiedError = classifyModelError(res.status, errText);
      lastError = classifiedError;

      if (!classifiedError.isCapacity || attempt === maxServerRetries) {
        throw classifiedError;
      }
    }

    if (!res || !res.ok) {
      throw lastError || new Error('Model Garden request failed.');
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
    try {
      return await this.model.generateContentStream(params);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('queue')) {
        throw new AIModelError({
          isCapacity: true,
          status: 429,
          message: 'Google AI request queue is currently at peak capacity. Your document and progress are preserved.',
          originalMessage: msg,
          retryAfterSeconds: 5,
        });
      }
      throw err;
    }
  }

  async generateContent(params: Parameters<GenerativeModel['generateContent']>[0]) {
    try {
      return await this.model.generateContent(params);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('queue')) {
        throw new AIModelError({
          isCapacity: true,
          status: 429,
          message: 'Google AI request queue is currently at peak capacity. Your document and progress are preserved.',
          originalMessage: msg,
          retryAfterSeconds: 5,
        });
      }
      throw err;
    }
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
