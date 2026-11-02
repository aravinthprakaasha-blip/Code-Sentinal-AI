import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerView } from '../../src/components/ScannerView';
import type { ScanResult } from '../../src/types';
import { makeScanResult } from './scanFixture';

const apiMocks = vi.hoisted(() => ({
  analyzeRepositoryOnBackend: vi.fn(),
  analyzeFilesOnBackend: vi.fn(),
}));

vi.mock('../../src/services/apiService', () => apiMocks);

const ScannerHarness = ({ onScanComplete }: { onScanComplete: (scan: ScanResult) => void }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  return (
    <>
      <ScannerView
        onScanComplete={(scan) => {
          setResult(scan);
          onScanComplete(scan);
        }}
        isScanning={isScanning}
        setIsScanning={setIsScanning}
      />
      {result && <p role="status">Analysis completed for {result.repo_name}</p>}
    </>
  );
};

describe('ScannerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a GitHub repository, shows progress, and renders the result', async () => {
    const user = userEvent.setup();
    const scanResult = makeScanResult('owner/repo');
    let finishAnalysis!: (result: ScanResult) => void;
    apiMocks.analyzeRepositoryOnBackend.mockReturnValue(new Promise<ScanResult>((resolve) => {
      finishAnalysis = resolve;
    }));
    const onScanComplete = vi.fn();
    render(<ScannerHarness onScanComplete={onScanComplete} />);

    await user.type(
      screen.getByPlaceholderText('https://github.com/psf/requests or psf/requests'),
      'https://github.com/owner/repo',
    );
    await user.click(screen.getByRole('button', { name: 'Scan Repository' }));

    expect(await screen.findByText('Scanning Pipeline Active...')).toBeInTheDocument();
    expect(apiMocks.analyzeRepositoryOnBackend).toHaveBeenCalledWith(
      'https://github.com/owner/repo',
      undefined,
    );
    finishAnalysis(scanResult);

    await waitFor(() => expect(onScanComplete).toHaveBeenCalledWith(scanResult));
    expect(await screen.findByText('Analysis completed for owner/repo')).toBeInTheDocument();
  });

  it('shows backend errors instead of presenting a successful analysis', async () => {
    const user = userEvent.setup();
    apiMocks.analyzeRepositoryOnBackend.mockRejectedValue(new Error('Backend is unavailable.'));
    render(<ScannerHarness onScanComplete={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('https://github.com/psf/requests or psf/requests'),
      'https://github.com/owner/repo',
    );
    await user.click(screen.getByRole('button', { name: 'Scan Repository' }));

    expect(await screen.findByText('Backend is unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('Analysis completed for owner/repo')).not.toBeInTheDocument();
  });
});
