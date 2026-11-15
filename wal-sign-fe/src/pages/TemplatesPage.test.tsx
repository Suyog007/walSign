import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentTemplate } from '../services/templateService';

const mocks = vi.hoisted(() => ({
  account: { address: '0xalice' } as { address: string } | null,
  templates: {} as Record<string, unknown>,
}));

vi.mock('@mysten/dapp-kit', () => ({ useCurrentAccount: () => mocks.account }));
vi.mock('../hooks/useTemplates', () => ({ useTemplates: () => mocks.templates }));
vi.mock('../components/TemplateEditor', () => ({ TemplateEditor: () => <div>template editor</div> }));
vi.mock('../components/TemplateSendPanel', () => ({
  TemplateSendPanel: ({ template }: { template: DocumentTemplate }) => <div>send panel for {template.name}</div>,
}));

import { TemplatesPage } from './TemplatesPage';

const lease = {
  templateId: '0xt1',
  name: 'Lease',
  roles: ['Tenant', 'Landlord'],
  fields: [{}, {}],
  sequential: true,
  walrusBlobId: 'b',
} as DocumentTemplate;

function setTemplates(overrides: Record<string, unknown> = {}) {
  mocks.templates = {
    templates: [lease],
    isLoading: false,
    isSaving: false,
    error: null,
    create: vi.fn(),
    remove: vi.fn(),
    openPdf: vi.fn().mockResolvedValue(new Uint8Array([1])),
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <TemplatesPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.account = { address: '0xalice' };
  setTemplates();
});

describe('TemplatesPage', () => {
  it('asks for a wallet', () => {
    mocks.account = null;
    renderPage();
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it('shows loading, empty and error states', () => {
    setTemplates({ isLoading: true, templates: [] });
    const { unmount } = renderPage();
    expect(screen.getByText(/loading templates/i)).toBeInTheDocument();
    unmount();

    setTemplates({ templates: [], error: 'rpc down' });
    renderPage();
    expect(screen.getByText(/no templates yet/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('rpc down');
  });

  it('lists templates with their roles', () => {
    renderPage();
    const item = within(screen.getByRole('list', { name: 'Templates' })).getByRole('listitem');
    expect(item).toHaveTextContent('Lease');
    expect(item).toHaveTextContent('Tenant → Landlord · 2 field(s) · in order');
  });

  it('opens the template and shows the send panel', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(mocks.templates.openPdf).toHaveBeenCalledWith(lease);
    expect(await screen.findByText('send panel for Lease')).toBeInTheDocument();
  });

  it('stays on the list when the template cannot be opened', async () => {
    setTemplates({ openPdf: vi.fn().mockResolvedValue(null) });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(screen.queryByText(/send panel/)).not.toBeInTheDocument();
  });

  it('deletes after confirmation only', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    const button = screen.getByRole('button', { name: /delete lease/i });

    await userEvent.click(button);
    expect(mocks.templates.remove).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(mocks.templates.remove).toHaveBeenCalledWith('0xt1');
    confirm.mockRestore();
  });

  it('opens the editor for a new template', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /new template/i }));
    expect(screen.getByText('template editor')).toBeInTheDocument();
  });
});
