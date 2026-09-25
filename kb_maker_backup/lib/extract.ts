import type { ExtractionResult } from '@/types/kb';

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
]);

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  // Handle both pdf-parse v1 (function) and pdf-parse v2 (PDFParse class)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  if (mimeType === 'application/pdf') {
    return extractFromPdf(buffer);
  }
  if (IMAGE_MIME_TYPES.has(mimeType)) {
    return extractFromImage(buffer);
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}
