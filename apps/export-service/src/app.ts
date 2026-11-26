import crypto from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  getPageGeometry,
  normalizePageSetup,
  type ExportRequest,
  type ReportDocument,
  type SaveReportRequest,
} from '@report-studio/shared';
import { buildDocxBuffer } from './docxBuilder.ts';
import { PdfBrowserPool } from './pdfPool.ts';
import { isValidReportId, ReportStore } from './reportStore.ts';
import { serializeDocumentToHtml } from './serializer.ts';
import { resolveSigningCertPath, signPdfBuffer } from './signer.ts';

function isValidReportDocument(doc: unknown): doc is ReportDocument {
  if (!doc || typeof doc !== 'object') return false;
  const candidate = doc as Partial<ReportDocument>;
  return candidate.type === 'doc' && Array.isArray(candidate.content);
}

function sanitizeFileSlug(raw?: string): string {
  const base = (raw || 'crystal-docpad-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'crystal-docpad-report';
}

export function buildExportApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
    bodyLimit: 15 * 1024 * 1024,
  });

  const pool = new PdfBrowserPool({
    maxConcurrent: 4,
    recycleAfterJobs: 300,
  });

  const reportStore = new ReportStore(process.env.REPORTS_DB_PATH);

  app.register(cors, {
    origin: true,
    exposedHeaders: ['X-Document-SHA256', 'X-PDF-Signed', 'Content-Disposition'],
  });

  app.addHook('onReady', async () => {
    await pool.init();
  });

  app.addHook('onClose', async () => {
    reportStore.close();
    await pool.close();
  });

  app.get('/api/health', async () => {
    const certStatus = resolveSigningCertPath();
    return {
      status: 'ok',
      browserPool: pool.getStats(),
      signingCertAvailable: certStatus.available,
      signingCertSource: certStatus.source,
      reportCount: reportStore.countReports(),
    };
  });

  app.get<{ Querystring: { q?: string } }>('/api/reports', async (request) => {
    const query = typeof request.query?.q === 'string' ? request.query.q : undefined;
    return {
      reports: reportStore.listReports(query),
    };
  });

  app.get<{ Params: { id: string } }>('/api/reports/:id', async (request, reply) => {
    const { id } = request.params;
    if (!isValidReportId(id)) {
      return reply.status(400).send({ error: 'Invalid report ID.' });
    }
    const report = reportStore.getReport(id);
    if (!report) {
      return reply.status(404).send({ error: 'Report not found.' });
    }
    return { report };
  });

  app.post<{ Body: SaveReportRequest }>('/api/reports', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.title !== 'string' || !isValidReportDocument(body.documentJson)) {
      return reply.status(400).send({
        error: 'Invalid payload: expected { title: string, author?: string, documentJson: { type: "doc", content: [...] } }.',
      });
    }
    const report = reportStore.createReport({
      title: body.title,
      author: typeof body.author === 'string' ? body.author : undefined,
      documentJson: body.documentJson,
      pageSetup: body.pageSetup,
    });
    return reply.status(201).send({ report });
  });

  app.put<{ Params: { id: string }; Body: SaveReportRequest }>(
    '/api/reports/:id',
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidReportId(id)) {
        return reply.status(400).send({ error: 'Invalid report ID.' });
      }
      const body = request.body;
      if (!body || typeof body.title !== 'string' || !isValidReportDocument(body.documentJson)) {
        return reply.status(400).send({
          error: 'Invalid payload: expected { title: string, author?: string, documentJson: { type: "doc", content: [...] } }.',
        });
      }
      const report = reportStore.updateReport(id, {
        title: body.title,
        author: typeof body.author === 'string' ? body.author : undefined,
        documentJson: body.documentJson,
        pageSetup: body.pageSetup,
      });
      if (!report) {
        return reply.status(404).send({ error: 'Report not found.' });
      }
      return { report };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/reports/:id', async (request, reply) => {
    const { id } = request.params;
    if (!isValidReportId(id)) {
      return reply.status(400).send({ error: 'Invalid report ID.' });
    }
    const deleted = reportStore.deleteReport(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Report not found.' });
    }
    return { deleted: true, id };
  });

  app.post<{ Body: ExportRequest }>('/api/export', async (request, reply) => {
    const body = request.body;
    if (!body || !isValidReportDocument(body.documentJson)) {
      return reply.status(400).send({
        error: 'Invalid payload: expected { documentJson: { type: "doc", content: [...] }, format: "pdf" | "docx" }',
      });
    }

    const format = body.format;
    if (format !== 'pdf' && format !== 'docx') {
      return reply.status(400).send({
        error: 'Invalid format: must be "pdf" or "docx".',
      });
    }

    const signPdf = Boolean(body.signPdf);
    const title = body.title?.trim() || 'Executive Report';
    const author = body.author?.trim() || 'Crystal DocPad';
    const fileSlug = sanitizeFileSlug(title);
    const pageSetup = normalizePageSetup(body.pageSetup);
    const geometry = getPageGeometry(pageSetup);

    const canonicalJson = JSON.stringify(body.documentJson);
    const documentHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

    const { html, chartCount } = serializeDocumentToHtml(body.documentJson, {
      title,
      author,
      documentHash,
      signed: format === 'pdf' && signPdf,
      pageSetup,
    });

    if (format === 'pdf') {
      const rawPdf = await pool.withPage(async (page) => {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        return page.pdf({
          format: geometry.spec.playwrightFormat,
          landscape: geometry.setup.orientation === 'landscape',
          printBackground: true,
          margin: {
            top: `${geometry.marginsMm.top}mm`,
            right: `${geometry.marginsMm.right}mm`,
            bottom: `${geometry.marginsMm.bottom}mm`,
            left: `${geometry.marginsMm.left}mm`,
          },
          displayHeaderFooter: true,
          headerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;padding:0 ${geometry.marginsMm.left}mm;display:flex;justify-content:space-between;font-family:sans-serif;"><span>${title.replace(/</g, '&lt;')}</span><span>${author.replace(/</g, '&lt;')}</span></div>`,
          footerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;padding:0 ${geometry.marginsMm.left}mm;display:flex;justify-content:space-between;font-family:monospace;"><span>SHA-256: ${documentHash.slice(0, 16)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        });
      });

      let finalPdf: Buffer = Buffer.from(rawPdf);
      let wasSigned = false;

      if (signPdf) {
        try {
          finalPdf = await signPdfBuffer(finalPdf, {
            name: author,
            reason: `Report integrity digest SHA-256:${documentHash.slice(0, 16)}`,
          });
          wasSigned = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'PDF signing failed';
          return reply.status(422).send({ error: message });
        }
      }

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${fileSlug}.pdf"`)
        .header('X-Document-SHA256', documentHash)
        .header('X-PDF-Signed', wasSigned ? 'true' : 'false')
        .send(finalPdf);
    }

    // DOCX generation: capture 2x high-DPI PNG screenshots of every #chart-{index} element
    const chartImages = await pool.withPage(
      async (page) => {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const images = new Map<number, Buffer>();
        for (let i = 0; i < chartCount; i++) {
          const locator = page.locator(`#chart-${i}`);
          if ((await locator.count()) > 0) {
            const png = await locator.screenshot({ type: 'png' });
            images.set(i, Buffer.from(png));
          }
        }
        return images;
      },
      { deviceScaleFactor: 2 },
    );

    const docxBuffer = await buildDocxBuffer(body.documentJson, chartImages, {
      title,
      author,
      documentHash,
      pageSetup,
    });

    return reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      .header('Content-Disposition', `attachment; filename="${fileSlug}.docx"`)
      .header('X-Document-SHA256', documentHash)
      .header('X-PDF-Signed', 'false')
      .send(docxBuffer);
  });

  return app;
}
