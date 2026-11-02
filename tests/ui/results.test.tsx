import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewView } from '../../src/components/OverviewView';
import { makeScanResult } from './scanFixture';

describe('analysis results', () => {
  it('renders repository identity, file count, and risk returned by the scan', () => {
    render(
      <OverviewView
        currentScan={makeScanResult('owner/reviewed-project')}
        savedScans={[]}
        onSelectSavedScan={() => undefined}
        onDeleteScan={() => undefined}
        onNavigateScanner={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: 'owner/reviewed-project' })).toBeInTheDocument();
    expect(screen.getByText('Python Files Analyzed')).toBeInTheDocument();
    expect(screen.getByText('Composite heuristic').parentElement).toHaveTextContent(/12\s*\(LOW\)/);
  });
});
