/**
 * @file src/types.ts
 * Shared data contracts and models for CodeSentry AI Python code analysis.
 */

export type SeverityLevel = 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'N/A';
export type FindingSource = 'bug' | 'security' | 'quality';
export type RiskLabel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Finding {
  id: string;
  source: FindingSource;
  rule_id: string;
  title: string;
  file_path: string; // repo-relative
  language?: string; // e.g. Python, TypeScript, JavaScript, Java, Go, C++, Rust, etc.
  line_start: number;
  line_end: number;
  severity: SeverityLevel;
  confidence: ConfidenceLevel;
  cwe?: string;
  description: string;
  suggested_fix: string;
  is_heuristic: boolean;
  snippet?: string;
}

export interface FileMetrics {
  path: string;
  language: string;
  loc: number;
  functions: number;
  classes: number;
  max_nesting: number;
  nested_loops: number;
  cyclomatic_complexity: number;
  bug_count: number;
  security_count: number;
  quality_count: number;
}

export interface FilePrediction {
  path: string;
  risk_score: number;
  risk_label: RiskLabel;
  top_features: string[];
}

export interface AIReview {
  finding_ids: string[];
  explanation: string;
  why_problematic: string;
  impact: string;
  original_snippet: string;
  corrected_snippet: string;
  change_explanation: string;
  prevention: string;
  disclaimer: string;
  isValidSyntax?: boolean;
}

export interface LanguageStat {
  files: number;
  loc: number;
  percentage: number;
}

export interface ScanResult {
  scan_id: string;
  repo_url: string;
  repo_name: string;
  branch: string;
  commit_sha: string;
  timestamp: string;
  settings_used: Record<string, any>;
  files: string[];
  languages_detected: Record<string, LanguageStat>;
  findings: Finding[];
  file_metrics: FileMetrics[];
  predictions: FilePrediction[];
  quality_score: number;
  risk_score: number;
  risk_label?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_reasons?: string[];
  risk_model?: string;
  ai_review?: {
    status: 'available' | 'unavailable' | 'not_requested';
    reason?: string | null;
    recommendations?: Array<{
      rule_id: string;
      explanation: string;
      suggested_code: string;
      best_practice: string;
    }>;
    repository_review?: string | null;
  };
  file_count?: number;
  python_file_count?: number;
  repository_file_count?: number;
  total_files_scanned?: number;
  repository_counts?: Record<string, number>;
  languages_detected_names?: string[];
  severity_counts?: Record<string, number>;
  total_findings?: number;
  findings_truncated?: boolean;
  source_counts?: Record<string, number>;
  risk_breakdown: {
    security: number;
    bugs: number;
    complexity: number;
    quality: number;
  };
  duration_seconds: number;
  warnings: string[];
  logs?: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserPreference {
  userId: string;
  geminiModel: string;
  maxFileSizeKb: number;
  maxScanTimeSec: number;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
