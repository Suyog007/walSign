import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../hooks/useCertificate', () => ({ useCertificateVerification: () => state.value }));

import { CertificateVerifyPage } from './CertificateVerifyPage';

const certificate = {
  documentId: '0xdoc',
  title: 'Lease',
  completedAt: 3000,
  signers: [{ address: '0x' + 'b'.repeat(64), signedAt: 2000, digest: 'tx' }],
  documentSha256: 'abc',
};

function setState(overrides: Record<string, unknown> = {}) {
  state.value = {
    verify: vi.fn(),
    compareDocument: vi.fn(),
    reset: vi.fn(),
    result: null,
    documentMatch: null,
    isVerifying: false,
    error: null,
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <CertificateVerifyPage />
    </MemoryRouter>,
  );

beforeEach(() => setState());

describe('CertificateVerifyPage', () => {
  it('verifies an uploaded certificate', async () => {
    renderPage();
    const file = new File(['%PDF'], 'certificate.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Drop a certificate PDF here'), file);
    expect(state.value.verify).toHaveBeenCalledWith(file);
  });

  it('shows progress and errors', () => {
    setState({ isVerifying: true, error: 'This PDF is not a WalSign certificate' });
    renderPage();
    expect(screen.getByText(/checking the certificate/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('not a WalSign certificate');
  });

  it('shows a valid result with every check', () => {
    setState({
      result: {
        certificate,
        valid: true,
        checks: [
          { label: 'Document exists on chain', status: 'pass' },
          { label: 'Stored file matches its hash', status: 'unavailable', detail: 'The blob could not be downloaded' },
        ],
      },
    });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Certificate is valid');
    const checks = within(screen.getByRole('list', { name: 'Checks' })).getAllByRole('listitem');
    expect(checks).toHaveLength(2);
    expect(within(checks[1]).getByLabelText('unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view document details/i })).toHaveAttribute('href', '/verify/0xdoc');
  });

  it('shows failed checks and the document comparison outcome', async () => {
    setState({
      result: {
        certificate,
        valid: false,
        checks: [{ label: 'Final version matches', status: 'fail', detail: 'Latest version on chain: blob-2' }],
      },
      documentMatch: false,
    });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('does not match the chain');
    expect(screen.getByText('Latest version on chain: blob-2')).toBeInTheDocument();
    expect(screen.getByText(/differs from the certified document/i)).toBeInTheDocument();

    const pdf = new File(['%PDF'], 'signed.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Drop the signed PDF'), pdf);
    expect(state.value.compareDocument).toHaveBeenCalledWith(pdf);

    await userEvent.click(screen.getByRole('button', { name: /verify another/i }));
    expect(state.value.reset).toHaveBeenCalled();
  });
});
