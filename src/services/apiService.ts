import { auth } from '../firebase';
import { AIReview, Finding, ScanResult } from '../types';
import { FileData } from './analyzerService';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

/** Error raised for a failed API call, carrying the backend's error code and HTTP status. */
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (configuredUrl) return configuredUrl;
  if (import.meta.env.DEV) return '';
  throw new ApiError(
    'The backend API URL is not configured. Set VITE_API_BASE_URL in the Vercel project settings and redeploy.',
    'not_configured',
    0
  );
}

const DEFAULT_TIMEOUT_MS = 60_000;

async function requestApi<T>(
  path: string,
  init: RequestInit = {},
  { requireAuth = true, timeoutMs = DEFAULT_TIMEOUT_MS }: { requireAuth?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (requireAuth) {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Sign in before using the analysis API.', 'unauthorized', 401);
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError(
        `The backend did not respond within ${Math.round(timeoutMs / 1000)} seconds. Large repositories can take longer; try again or scan a smaller branch.`,
        'timeout',
        0
      );
    }
    throw new ApiError(
      'The CodeSentry backend could not be reached. Check that it is running, the API URL (VITE_API_BASE_URL), and CORS settings.',
      'network_error',
      0
    );
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      `The backend returned a non-JSON response (${response.status}). Check VITE_API_BASE_URL and the backend deployment.`,
      'bad_response',
      response.status
    );
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success || envelope.data === null) {
    throw new ApiError(
      envelope.error?.message || `Backend request failed (${response.status}).`,
      envelope.error?.code || 'request_failed',
      response.status
    );
  }
  return envelope.data;
}

function asScanResult(result: ScanResult): ScanResult {
  return {
    ...result,
    findings: result.findings || [],
    files: result.files || [],
    predictions: result.predictions || [],
    file_metrics: result.file_metrics || [],
    risk_breakdown: result.risk_breakdown || { security: 0, bugs: 0, complexity: 0, quality: 0 },
    warnings: result.warnings || [],
    logs: result.logs || [],
  };
}

export interface BranchList {
  repo_url: string;
  default_branch: string | null;
  branches: string[];
  private: boolean;
  truncated: boolean;
}

export async function listRepositoryBranches(repoUrl: string, githubToken?: string): Promise<BranchList> {
  return requestApi<BranchList>('/api/repository/branches', {
    method: 'POST',
    body: JSON.stringify({ repo_url: repoUrl, github_token: githubToken || null }),
  });
}

export async function analyzeRepositoryOnBackend(
  repoUrl: string,
  branch?: string,
  githubToken?: string
): Promise<ScanResult> {
  const data = await requestApi<ScanResult>(
    '/api/analyze/repository',
    {
      method: 'POST',
      body: JSON.stringify({
        repo_url: repoUrl,
        branch: branch || null,
        include_ai: true,
        github_token: githubToken || null,
      }),
    },
    { timeoutMs: 300_000 }
  );
  return asScanResult(data);
}

export async function analyzeFilesOnBackend(
  repoName: string,
  files: FileData[],
  repoUrl = 'local://uploaded-source',
  { includeAi = false, saveHistory = true }: { includeAi?: boolean; saveHistory?: boolean } = {}
): Promise<ScanResult> {
  const data = await requestApi<ScanResult>(
    '/api/analyze',
    {
      method: 'POST',
      body: JSON.stringify({
        repo_name: repoName,
        repo_url: repoUrl,
        branch: 'local',
        include_ai: includeAi,
        save_history: saveHistory,
        files: files.map(({ path, content }) => ({ path, content })),
      }),
    },
    { timeoutMs: 180_000 }
  );
  return asScanResult(data);
}

export async function generateBackendFindingReview(
  finding: Finding,
  sourceSnippet: string
): Promise<AIReview> {
  const data = await requestApi<{
    status: string;
    reason: string | null;
    error_code?: string | null;
    review: AIReview | null;
  }>('/api/ai/review', {
    method: 'POST',
    body: JSON.stringify({ finding, source_snippet: sourceSnippet }),
  });
  if (data.status !== 'available' || !data.review) {
    throw new ApiError(data.reason || 'AI review is unavailable.', data.error_code || 'ai_unavailable', 200);
  }
  return data.review;
}

export async function askBackendAssistant(
  question: string,
  scan: ScanResult
): Promise<{ answer: string | null; reason: string | null }> {
  const data = await requestApi<{
    status: string;
    reason: string | null;
    answer: string | null;
  }>('/api/ai/assistant', {
    method: 'POST',
    body: JSON.stringify({
      question,
      scan_summary: {
        repo_name: scan.repo_name,
        repo_url: scan.repo_url,
        branch: scan.branch,
        risk_score: scan.risk_score,
        risk_label: scan.risk_label,
        quality_score: scan.quality_score,
        security_status: scan.security_status?.label,
        coverage_status: scan.coverage?.coverage_status,
        severity_counts: scan.severity_counts,
        total_findings: scan.total_findings,
        findings: scan.findings.slice(0, 20).map(finding => ({
          rule_id: finding.rule_id,
          title: finding.title,
          category: finding.category,
          severity: finding.severity,
          confidence: finding.confidence,
          file_path: finding.file_path,
          line: finding.line_start,
          description: finding.description,
        })),
      },
    }),
  });
  return { answer: data.status === 'available' ? data.answer : null, reason: data.reason };
}

export interface BackendHealth {
  status: string;
  version: string;
  configuration: {
    firebase_auth: boolean;
    gemini: boolean;
    gemini_model: string | null;
    github_token: boolean;
    dependency_scan: boolean;
    bandit: boolean;
    pyflakes: boolean;
  };
  note: string;
  limits: Record<string, number>;
}

export async function getBackendHealth(): Promise<BackendHealth> {
  return requestApi<BackendHealth>('/api/health', {}, { requireAuth: false, timeoutMs: 15_000 });
}

export interface AnalysisHistoryItem {
  id: string;
  analysis_id: string;
  scan_id: string;
  repo_url: string;
  repo_name: string;
  branch: string;
  created_at: string;
  risk_score: number;
  risk_label: string;
  quality_score: number;
  file_count: number;
  findings_count: number;
  severity_counts: Record<string, number>;
  security_status?: string | null;
  coverage_status?: string | null;
}

export async function listAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  const data = await requestApi<{ items: AnalysisHistoryItem[]; next_cursor: string | null }>(
    '/api/analysis/history?limit=50'
  );
  return data.items.map(item => ({ ...item, id: item.analysis_id }));
}

export async function getAnalysis(analysisId: string): Promise<ScanResult> {
  const data = await requestApi<ScanResult>(
    `/api/analysis/${encodeURIComponent(analysisId)}`
  );
  return asScanResult(data);
}

export async function deleteAnalysis(analysisId: string): Promise<void> {
  await requestApi<{ analysis_id: string; deleted: boolean }>(
    `/api/analysis/${encodeURIComponent(analysisId)}`,
    { method: 'DELETE' }
  );
}
