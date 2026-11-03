import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewView } from '../../src/components/OverviewView';
import { makeScanResult } from './scanFixture';
import type { ScanResult } from '../../src/types';

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
    expect(screen.getByText('Files Scanned')).toBeInTheDocument();
    expect(screen.getByText('Transparent rule-based score').parentElement).toHaveTextContent(/12\s*\(LOW\)/);
  });

  it('shows coverage, security status, and labels AI output as unverified suggestions', () => {
    const scan: ScanResult = {
      ...makeScanResult('owner/partial'),
      findings: [
        {
          id: 'f1',
          source: 'security',
          rule_id: 'B602',
          title: 'subprocess popen with shell equals true',
          category: 'Command Injection',
          analyzer: 'Bandit',
          file_path: 'app.py',
          line_start: 3,
          line_end: 3,
          severity: 'HIGH',
          confidence: 'HIGH',
          description: 'shell=True',
          suggested_fix: 'Avoid shell=True',
          is_heuristic: false,
        },
      ],
      security_status: {
        code: 'HIGH_RISK',
        label: 'High risk (partial coverage)',
        message: 'Coverage is incomplete — unscanned code may contain issues.',
      },
      coverage: {
        repository_files: 10,
        files_scanned: 6,
        code_files_scanned: 5,
        config_files_scanned: 1,
        dependency_manifests: 0,
        files_skipped: 4,
        skipped: { unsupported_type: 2, binary_or_media: 2 },
        skipped_examples: [{ path: 'App.kt', reason: 'unsupported language (Kotlin)' }],
        unsupported_languages: { Kotlin: 2 },
        analysis_failures: [{ path: 'bad.py', reason: 'Python syntax error' }],
        bandit_status: 'completed',
        dependency_scan: {
          status: 'not_applicable', manifests: [], packages_checked: 0, unpinned_dependencies: 0,
          vulnerable_packages: 0, parse_errors: [], source: 'OSV.dev',
        },
        coverage_ratio: 0.71,
        coverage_status: 'partial',
        languages: { Python: { files: 5, loc: 50, analyzers: ['Bandit', 'Pyflakes'] } },
      },
      ai_review: {
        status: 'available',
        repository_review: 'One command injection needs attention.',
        findings: {
          f1: {
            finding_id: 'f1', rule_id: 'B602', verdict: 'likely_true_positive', explanation: 'User input reaches a shell.',
            why_problem: '', impact: '', recommended_fix: 'Pass an argument list.', corrected_code: '', ai_generated: true,
            disclaimer: 'AI-generated suggestion.',
          },
        },
        reviewed_finding_count: 1,
        requested_finding_count: 1,
      },
    };
    render(
      <OverviewView
        currentScan={scan}
        savedScans={[]}
        onSelectSavedScan={() => undefined}
        onDeleteScan={() => undefined}
        onNavigateScanner={() => undefined}
      />,
    );

    expect(screen.getByText('Security status: High risk (partial coverage)')).toBeInTheDocument();
    expect(screen.getByText(/partial · 71% of analyzable files fully scanned/)).toBeInTheDocument();
    expect(screen.getByText(/Unsupported languages: Kotlin \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/bad.py: Python syntax error/)).toBeInTheDocument();
    expect(screen.getByText('AI-generated suggestions — not verified fixes')).toBeInTheDocument();
    expect(screen.getByText('User input reaches a shell.')).toBeInTheDocument();
  });

  it('explains when AI review is unavailable instead of hiding it', () => {
    const scan: ScanResult = {
      ...makeScanResult('owner/repo'),
      ai_review: { status: 'unavailable', reason: 'Gemini quota or rate limit exceeded.' },
    };
    render(
      <OverviewView
        currentScan={scan}
        savedScans={[]}
        onSelectSavedScan={() => undefined}
        onDeleteScan={() => undefined}
        onNavigateScanner={() => undefined}
      />,
    );
    expect(screen.getByText(/AI review unavailable: Gemini quota or rate limit exceeded/)).toBeInTheDocument();
  });
});
