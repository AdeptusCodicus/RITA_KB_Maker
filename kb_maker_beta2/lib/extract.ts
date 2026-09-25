import type { ExtractionResult } from '@/types/kb';

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  // Handle both pdf-parse v1 (function) and pdf-parse v2 (PDFParse class)
  const pdfModule = require('pdf-parse');

  if (typeof pdfModule === 'function') {
    const data = await pdfModule(buffer);
    return {
      text: data.text.trim(),
      pageCount: data.numpages,
    };
  }

  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: new Uint8Array(buffer) });
    const data = await parser.getText();
    const extractedText = (
      data.text ||
      (data.pages ? data.pages.map((p: { text: string }) => p.text).join('\n\n') : '')
    ).trim();
    return {
      text: extractedText,
      pageCount: data.total ?? data.pages?.length,
    };
  }

  if (typeof pdfModule.default === 'function') {
    const data = await pdfModule.default(buffer);
    return {
      text: data.text.trim(),
      pageCount: data.numpages,
    };
  }

  throw new Error('Could not initialize pdf-parse library.');
}

async function extractFromImage(buffer: Buffer): Promise<ExtractionResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  const { data } = await worker.recognize(buffer);
  await worker.terminate();
  return { text: data.text.trim() };
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value.trim() };
}

function extractFromText(buffer: Buffer): ExtractionResult {
  return { text: buffer.toString('utf-8').trim() };
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<ExtractionResult> {
  const ext = filename ? filename.toLowerCase().split('.').pop() : '';

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return extractFromPdf(buffer);
  }
  if (DOCX_MIME_TYPES.has(mimeType) || ext === 'docx' || ext === 'doc') {
    return extractFromDocx(buffer);
  }
  if (TEXT_MIME_TYPES.has(mimeType) || ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
    return extractFromText(buffer);
  }
  if (IMAGE_MIME_TYPES.has(mimeType) || ['png', 'jpg', 'jpeg', 'webp', 'tiff'].includes(ext || '')) {
    return extractFromImage(buffer);
  }

  throw new Error(`Unsupported file type: ${mimeType || ext}`);
}
