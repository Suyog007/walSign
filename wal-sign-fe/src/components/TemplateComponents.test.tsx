import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { DocumentTemplate, SignatureFieldPlacement } from '../services/templateService';

const mocks = vi.hoisted(() => ({
  sendState: {} as Record<string, unknown>,
  stamp: vi.fn(),
}));

vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react');
  return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: ({ children, onLoadSuccess }: { children: ReactNode; onLoadSuccess: (d: { numPages: number }) => void }) => {
      useEffect(() => onLoadSuccess({ numPages: 2 }), []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div>{children}</div>;
    },
    Page: ({ onLoadSuccess }: { onLoadSuccess: (p: { originalWidth: number; originalHeight: number }) => void }) => {
      useEffect(() => onLoadSuccess({ originalWidth: 595, originalHeight: 842 }), []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="pdf-page" />;
    },
  };
});
vi.mock('../hooks/useTemplateSend', () => ({ useTemplateSend: () => mocks.sendState }));
vi.mock('../services/templateService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/templateService')>()),
  stampSignatureFields: mocks.stamp,
}));

import { TemplateFieldPlacer } from './TemplateFieldPlacer';
import { TemplateEditor } from './TemplateEditor';
import { TemplateSendPanel } from './TemplateSendPanel';

const A = '0x' + 'a'.repeat(64);
const B = '0x' + 'b'.repeat(64);
const pdfFile = () => new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' });

describe('TemplateFieldPlacer', () => {
  it('adds a field for the active role where the page is clicked', () => {
    const onChange = vi.fn();
    render(<TemplateFieldPlacer file={pdfFile()} roles={['Tenant', 'Landlord']} activeRole={1} fields={[]} onChange={onChange} />);

    const overlay = screen.getByTestId('field-overlay');
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    fireEvent.click(overlay, { clientX: 400, clientY: 400 });

    expect(onChange).toHaveBeenCalledWith([{ role: 1, page: 0, x: 410, y: 475, width: 180, height: 50 }]);
  });

  it('shows the fields of the current page and removes them', async () => {
    const fields: SignatureFieldPlacement[] = [
      { role: 0, page: 0, x: 10, y: 10, width: 180, height: 50 },
      { role: 1, page: 1, x: 10, y: 10, width: 180, height: 50 },
    ];
    const onChange = vi.fn();
    render(<TemplateFieldPlacer file={pdfFile()} roles={['Tenant', 'Landlord']} activeRole={0} fields={fields} onChange={onChange} />);

    expect(screen.queryByRole('button', { name: /remove landlord field/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove tenant field/i }));
    expect(onChange).toHaveBeenCalledWith([fields[1]]);

    await userEvent.click(screen.getByRole('button', { name: '→' }));
    expect(screen.getByRole('button', { name: /remove landlord field/i })).toBeInTheDocument();
  });
});

describe('TemplateEditor', () => {
  it('requires a PDF before saving', async () => {
    const onSave = vi.fn();
    render(<TemplateEditor onSave={onSave} onCancel={vi.fn()} isSaving={false} error={null} />);
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose the PDF');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the roles, fields and order with the chosen file', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<TemplateEditor onSave={onSave} onCancel={vi.fn()} isSaving={false} error={null} />);
    const file = pdfFile();

    await userEvent.upload(screen.getByLabelText('Template PDF'), file);
    await userEvent.type(screen.getByPlaceholderText('e.g. Residential lease'), 'Lease');
    await userEvent.clear(screen.getByLabelText('Role 1 name'));
    await userEvent.type(screen.getByLabelText('Role 1 name'), 'Tenant');
    await userEvent.click(screen.getByRole('button', { name: /add role/i }));
    await userEvent.click(screen.getByLabelText('Place fields for role 2'));

    const overlay = screen.getByTestId('field-overlay');
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    fireEvent.click(overlay, { clientX: 400, clientY: 400 });

    await userEvent.click(screen.getByRole('checkbox', { name: /sign in this order/i }));
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));

    expect(onSave).toHaveBeenCalledWith(
      {
        name: 'Lease',
        description: '',
        roles: ['Tenant', 'Signer 2'],
        fields: [{ role: 1, page: 0, x: 410, y: 475, width: 180, height: 50 }],
        sequential: true,
      },
      file,
    );
  });

  it('drops a removed role’s fields and re-indexes the rest', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<TemplateEditor onSave={onSave} onCancel={vi.fn()} isSaving={false} error={null} />);
    await userEvent.upload(screen.getByLabelText('Template PDF'), pdfFile());
    await userEvent.type(screen.getByPlaceholderText('e.g. Residential lease'), 'NDA');
    await userEvent.click(screen.getByRole('button', { name: /add role/i }));
    await userEvent.click(screen.getByLabelText('Place fields for role 2'));
    const overlay = screen.getByTestId('field-overlay');
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    fireEvent.click(overlay, { clientX: 200, clientY: 200 });

    await userEvent.click(screen.getByRole('button', { name: 'Remove role 1' }));
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));

    const draft = onSave.mock.calls[0][0];
    expect(draft.roles).toEqual(['Signer 2']);
    expect(draft.fields.map((f: SignatureFieldPlacement) => f.role)).toEqual([0]);
  });

  it('shows validation and save errors', async () => {
    const { rerender } = render(<TemplateEditor onSave={vi.fn()} onCancel={vi.fn()} isSaving={false} error={null} />);
    await userEvent.upload(screen.getByLabelText('Template PDF'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the template a name');

    rerender(<TemplateEditor onSave={vi.fn()} onCancel={vi.fn()} isSaving={false} error="Walrus upload failed" />);
    await userEvent.type(screen.getByPlaceholderText('e.g. Residential lease'), 'NDA');
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Walrus upload failed');
  });
});

describe('TemplateSendPanel', () => {
  const template: DocumentTemplate = {
    templateId: '0xt',
    name: 'Lease',
    description: '',
    walrusBlobId: 'b',
    roles: ['Tenant', 'Landlord'],
    fields: [{ role: 0, page: 0, x: 0, y: 0, width: 180, height: 50 }],
    sequential: true,
    createdAt: 0,
  };
  const pdf = new Uint8Array([37]);

  beforeEach(() => {
    mocks.stamp.mockResolvedValue(new Uint8Array([38]));
    mocks.sendState = {
      send: vi.fn(),
      progress: { stage: 'idle', done: 0, total: 0 },
      sent: [],
      failed: [],
      error: null,
    };
  });

  const renderPanel = () =>
    render(
      <MemoryRouter>
        <TemplateSendPanel template={template} pdf={pdf} />
      </MemoryRouter>,
    );

  it('sends one document with an address per role and the template defaults', async () => {
    renderPanel();
    await userEvent.type(screen.getByRole('textbox', { name: 'Tenant' }), A);
    await userEvent.type(screen.getByRole('textbox', { name: 'Landlord' }), B);
    await userEvent.click(screen.getByRole('button', { name: 'Send document' }));

    expect(mocks.stamp).toHaveBeenCalledWith(pdf, template.fields, template.roles);
    expect(mocks.sendState.send).toHaveBeenCalledWith({
      pdf: new Uint8Array([38]),
      title: 'Lease',
      rows: [[A, B]],
      workflow: { sequential: true },
    });
  });

  it('explains a missing or invalid address', async () => {
    renderPanel();
    await userEvent.type(screen.getByRole('textbox', { name: 'Tenant' }), A);
    await userEvent.click(screen.getByRole('button', { name: 'Send document' }));
    expect(screen.getByRole('alert')).toHaveTextContent('expected 2 addresses, found 1');
    expect(mocks.sendState.send).not.toHaveBeenCalled();
  });

  it('bulk sends one document per valid line and reports bad lines', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('tab', { name: 'Bulk send' }));
    const textarea = screen.getByLabelText(/one document per line/i);
    await userEvent.click(textarea);
    await userEvent.paste(`${A}, ${B}\n${B}, ${A}\n`);
    expect(screen.getByText('2 documents ready')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /sign in order/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 documents' }));
    expect(mocks.sendState.send).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [[A, B], [B, A]], workflow: {} }),
    );

    await userEvent.click(textarea);
    await userEvent.paste('0x12');
    expect(screen.getByText(/1 line\(s\) need fixing/)).toBeInTheDocument();
  });

  it('shows progress while sending', () => {
    mocks.sendState.progress = { stage: 'uploading', done: 1, total: 3 };
    renderPanel();
    expect(screen.getByText(/encrypting and uploading 2\/3/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });

  it('lists the sent documents and any failures', () => {
    mocks.sendState = {
      ...mocks.sendState,
      progress: { stage: 'complete', done: 1, total: 2 },
      sent: [{ documentId: '0xd1', title: 'Lease - 0xaaaa...aaaa', signers: [A, B] }],
      failed: [{ title: 'Lease - 0xbbbb...bbbb', signers: [B, A], error: 'Walrus upload failed (503)' }],
    };
    renderPanel();

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('1 document sent');
    expect(within(status).getByRole('link', { name: 'Lease - 0xaaaa...aaaa' })).toHaveAttribute('href', '/sign/0xd1');
    expect(status).toHaveTextContent('Walrus upload failed (503)');
  });
});
