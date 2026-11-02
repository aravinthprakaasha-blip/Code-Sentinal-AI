import { auth } from '../firebase';
import { AIReview, Finding, ScanResult } from '../types';
import { FileData } from './analyzerService';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (configuredUrl) return configuredUrl;
  if (import.meta.env.DEV) return '';
  throw new Error(
    'The backend API URL is not configured. Set VITE_API_BASE_URL in the Vercel project settings and redeploy.'
  );
}

async function requestApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before using the analysis API.');

  const idToken = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new Error('The CodeSentry backend could not be reached. Check the API URL and CORS settings.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'The backend returned a non-JSON response. Check VITE_API_BASE_URL and the backend deployment.'
    );
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success || envelope.data === null) {
    throw new Error(envelope.error?.message || `Backend request failed (${response.status}).`);
  }
  return envelope.data;
}

function asScanResult(result: ScanResult): ScanResult {
  return {
    ...result,
    predictions: result.predictions || [],
    risk_breakdown: result.risk_breakdown,
    warnings: result.warnings || [],
    logs: result.logs || [],
  };
}

export async function analyzeRepositoryOnBackend(
  repoUrl: string,
  branch?: string
): Promise<ScanResult> {
  const data = await requestApi<ScanResult>('/api/analyze/repository', {
    method: 'POST',
    body: JSON.stringify({ repo_url: repoUrl, branch: branch || null, include_ai: true }),
  });
  return asScanResult(data);
}

export async function analyzeFilesOnBackend(
  repoName: string,
  files: FileData[],
  repoUrl = 'local://uploaded-source'
): Promise<ScanResult> {
  const data = await requestApi<ScanResult>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      repo_name: repoName,
      repo_url: repoUrl,
      branch: 'local',
      include_ai: false,
      files: files.map(({ path, content }) => ({ path, content })),
    }),
  });
  return asScanResult(data);
}

export async function generateBackendFindingReview(
  finding: Finding,
  sourceSnippet: string
): Promise<AIReview> {
  const data = await requestApi<{
    status: string;
    reason: string | null;
    review: AIReview | null;
  }>('/api/ai/review', {
    method: 'POST',
    body: JSON.stringify({ finding, source_snippet: sourceSnippet }),
  });
  if (data.status !== 'available' || !data.review) {
    throw new Error(data.reason || 'AI review is unavailable.');
  }
  return data.review;
}

export async function askBackendAssistant(
  question: string,
  scan: ScanResult
): Promise<string | null> {
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
        risk_score: scan.risk_score,
        quality_score: scan.quality_score,
        findings: scan.findings.slice(0, 20),
      },
    }),
  });
  return data.status === 'available' ? data.answer : null;
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
