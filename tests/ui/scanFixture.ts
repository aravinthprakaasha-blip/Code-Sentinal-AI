import type { ScanResult } from '../../src/types';

export const makeScanResult = (repoName = 'owner/repo'): ScanResult => ({
  scan_id: 'analysis-123',
  repo_url: 'https://github.com/owner/repo',
  repo_name: repoName,
  branch: 'main',
  commit_sha: 'abc123',
  timestamp: '2025-01-01T00:00:00Z',
  settings_used: {},
  files: ['main.py'],
  languages_detected: { Python: { files: 1, loc: 10, percentage: 100 } },
  findings: [],
  file_metrics: [],
  predictions: [],
  quality_score: 90,
  risk_score: 12,
  risk_label: 'LOW',
  risk_breakdown: { security: 0, bugs: 0, complexity: 0, quality: 0 },
  duration_seconds: 0.2,
  warnings: [],
});
