import { EncryptedObject, SessionKey } from '@mysten/seal';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, isValidSuiAddress } from '@mysten/sui/utils';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getSealClient, PACKAGE_ID, SEAL_THRESHOLD } from '../config/seal.config';

const CLOCK_OBJECT_ID = '0x6';

/** Limits mirrored from the template Move module */
export const MAX_TEMPLATE_NAME_BYTES = 100;
export const MAX_TEMPLATE_ROLES = 20;
export const MAX_TEMPLATE_FIELDS = 100;

/** Default size of a new signature field, in PDF points */
export const DEFAULT_FIELD_SIZE = { width: 180, height: 50 };

/** Rectangle where a role signs, in PDF points from the page's top-left corner */
export interface SignatureFieldPlacement {
  role: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateDraft {
  name: string;
  description: string;
  roles: string[];
  fields: SignatureFieldPlacement[];
  sequential: boolean;
}

export interface DocumentTemplate extends TemplateDraft {
  templateId: string;
  walrusBlobId: string;
  createdAt: number;
}

// ======== Reading ========

/** List the templates owned by `owner`, newest first */
export async function listTemplates(suiClient: SuiClient, owner: string): Promise<DocumentTemplate[]> {
  const templates: DocumentTemplate[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await suiClient.getOwnedObjects({
      owner,
      cursor,
      limit: 50,
      filter: { StructType: `${PACKAGE_ID}::template::Template` },
      options: { showContent: true },
    });
    for (const object of page.data) {
      const content = object.data?.content;
      if (content?.dataType !== 'moveObject') continue;
      templates.push(parseTemplate(object.data!.objectId, content.fields as any));
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return templates.sort((a, b) => b.createdAt - a.createdAt);
}

export function parseTemplate(templateId: string, fields: any): DocumentTemplate {
  return {
    templateId,
    name: fields.name,
    description: fields.description ?? '',
    walrusBlobId: fields.walrus_blob_id ?? '',
    roles: fields.roles ?? [],
    fields: (fields.fields ?? []).map((entry: any) => {
      const f = entry.fields ?? entry;
      return {
        role: Number(f.role),
        page: Number(f.page),
        x: Number(f.x),
        y: Number(f.y),
        width: Number(f.width),
        height: Number(f.height),
      };
    }),
    sequential: Boolean(fields.sequential),
    createdAt: Number(fields.created_at),
  };
}

// ======== Validation ========

export function validateTemplateDraft(draft: TemplateDraft): string | null {
  const name = draft.name.trim();
  if (!name) return 'Give the template a name';
  if (new TextEncoder().encode(name).length > MAX_TEMPLATE_NAME_BYTES) return 'The name is too long';
  if (draft.roles.length === 0) return 'Add at least one signer role';
  if (draft.roles.length > MAX_TEMPLATE_ROLES) return `A template can have at most ${MAX_TEMPLATE_ROLES} roles`;
  if (draft.roles.some((role) => !role.trim())) return 'Every role needs a name';
  if (new Set(draft.roles.map((r) => r.trim().toLowerCase())).size !== draft.roles.length) {
    return 'Role names must be unique';
  }
  if (draft.fields.length > MAX_TEMPLATE_FIELDS) return `A template can have at most ${MAX_TEMPLATE_FIELDS} fields`;
  if (draft.fields.some((f) => f.role < 0 || f.role >= draft.roles.length)) {
    return 'A signature field belongs to a role that no longer exists';
  }
  return null;
}

/**
 * Place a default-size field centred on a click, clamped to the page.
 * `scale` is rendered pixels per PDF point.
 */
export function placeField(
  role: number,
  page: number,
  click: { x: number; y: number },
  scale: number,
  pageSize: { width: number; height: number },
): SignatureFieldPlacement {
  const { width, height } = DEFAULT_FIELD_SIZE;
  const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(value, 0), Math.max(max, 0)));
  return {
    role,
    page,
    x: clamp(click.x / scale - width / 2, pageSize.width - width),
    y: clamp(click.y / scale - height / 2, pageSize.height - height),
    width,
    height,
  };
}

// ======== Transactions ========

export function buildCreateTemplateTx(draft: TemplateDraft): Transaction {
  const tx = new Transaction();
  const fields = draft.fields.map((f) =>
    tx.moveCall({
      target: `${PACKAGE_ID}::template::new_field`,
      arguments: [f.role, f.page, f.x, f.y, f.width, f.height].map((v) => tx.pure.u64(v)),
    }),
  );
  tx.moveCall({
    target: `${PACKAGE_ID}::template::create_template`,
    arguments: [
      tx.pure.string(draft.name.trim()),
      tx.pure.string(draft.description.trim()),
      tx.pure.vector('string', draft.roles.map((r) => r.trim())),
      tx.makeMoveVec({ type: `${PACKAGE_ID}::template::SignatureField`, elements: fields }),
      tx.pure.bool(draft.sequential),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildSetTemplateBlobTx(templateId: string, walrusBlobId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::template::set_blob_id`,
    arguments: [tx.object(templateId), tx.pure.string(walrusBlobId)],
  });
  return tx;
}

export function buildDeleteTemplateTx(templateId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE_ID}::template::delete_template`, arguments: [tx.object(templateId)] });
  return tx;
}

// ======== Encryption ========

/** Decrypt a template PDF downloaded from Walrus; only the owner passes seal_approve_template */
export async function decryptTemplatePdf(
  suiClient: SuiClient,
  templateId: string,
  encrypted: Uint8Array,
  sessionKey: SessionKey,
): Promise<Uint8Array> {
  const { id } = EncryptedObject.parse(encrypted);
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::template::seal_approve_template`,
    arguments: [tx.pure.vector('u8', fromHex(id)), tx.object(templateId)],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
  const sealClient = getSealClient();
  await sealClient.fetchKeys({ ids: [id], txBytes, sessionKey, threshold: SEAL_THRESHOLD });
  return sealClient.decrypt({ data: encrypted, sessionKey, txBytes });
}

// ======== Documents from templates ========

/** Draw a labelled box for every signature field so signers see where to sign */
export async function stampSignatureFields(
  pdfBytes: Uint8Array,
  fields: SignatureFieldPlacement[],
  roles: string[],
): Promise<Uint8Array> {
  if (fields.length === 0) return pdfBytes;
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const color = rgb(0.42, 0.13, 0.66);

  for (const field of fields) {
    const page = pages[field.page];
    if (!page) continue;
    const bottom = page.getHeight() - field.y - field.height;
    page.drawRectangle({
      x: field.x,
      y: bottom,
      width: field.width,
      height: field.height,
      borderColor: color,
      borderWidth: 1,
      borderDashArray: [4, 3],
      color,
      opacity: 0.05,
    });
    const label = `Sign here: ${roles[field.role] ?? ''}`.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
    page.drawText(label, { x: field.x + 4, y: bottom + 4, size: 8, font, color });
  }
  return pdf.save();
}

/**
 * Parse recipients for a send: one line per document, addresses for each
 * role separated by commas or whitespace, in role order.
 */
export function parseRecipientRows(text: string, roleCount: number): { rows: string[][]; errors: string[] } {
  const rows: string[][] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const addresses = trimmed.split(/[\s,;]+/).filter(Boolean);
    const lineNo = index + 1;
    if (addresses.length !== roleCount) {
      errors.push(`Line ${lineNo}: expected ${roleCount} address${roleCount === 1 ? '' : 'es'}, found ${addresses.length}`);
    } else if (addresses.some((a) => !isValidSuiAddress(a))) {
      errors.push(`Line ${lineNo}: invalid Sui address`);
    } else if (new Set(addresses).size !== addresses.length) {
      errors.push(`Line ${lineNo}: the same address is used for two roles`);
    } else {
      rows.push(addresses);
    }
  });
  return { rows, errors };
}
