import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';

export interface SigningCertStatus {
  available: boolean;
  certPath: string | null;
  source: 'env' | 'default' | 'none';
}

export interface SignPdfOptions {
  reason?: string;
  contactInfo?: string;
  name?: string;
  location?: string;
}

export function resolveSigningCertPath(): SigningCertStatus {
  const envPath = process.env.SIGNING_CERT_PATH?.trim();
  if (envPath) {
    const resolved = path.resolve(process.cwd(), envPath);
    if (fs.existsSync(resolved)) {
      return { available: true, certPath: resolved, source: 'env' };
    }
    return { available: false, certPath: resolved, source: 'env' };
  }

  const defaultPath = path.resolve(
    process.cwd(),
    'apps',
    'export-service',
    'certs',
    'signing-cert.p12',
  );
  if (fs.existsSync(defaultPath)) {
    return { available: true, certPath: defaultPath, source: 'default' };
  }

  return { available: false, certPath: null, source: 'none' };
}

export async function signPdfBuffer(
  pdfBuffer: Buffer,
  options: SignPdfOptions = {},
): Promise<Buffer> {
  const status = resolveSigningCertPath();
  if (!status.available || !status.certPath) {
    throw new Error(
      'PKCS#12 signing certificate not found. Set SIGNING_CERT_PATH or run `npm run gen:cert` to generate a local test .p12 certificate.',
    );
  }

  const p12Buffer = fs.readFileSync(status.certPath);
  const passphrase = process.env.SIGNING_CERT_PASSWORD ?? '';

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: options.reason ?? 'Verified integrity & authorship export',
    contactInfo: options.contactInfo ?? 'reports@crystaldocpad.local',
    name: options.name ?? 'Crystal DocPad',
    location: options.location ?? 'San Francisco, CA',
    signatureLength: 8192,
  });

  const pdfWithPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  const signer = new P12Signer(p12Buffer, { passphrase });
  const signPdf = new SignPdf();
  const signedBuffer = await signPdf.sign(Buffer.from(pdfWithPlaceholder), signer);

  return Buffer.from(signedBuffer);
}
