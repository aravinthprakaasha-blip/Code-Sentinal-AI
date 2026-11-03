/**
 * @file src/types.ts
 * Shared data contracts and models for CodeSentry AI Python code analysis.
 */

export type SeverityLevel = 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'N/A';
export type FindingSource = 'bug' | 'security' | 'quality' | 'dependency';
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
  /** Redacted lines around the finding, used for AI review. */
  context?: string;
  /** Vulnerability category, e.g. "SQL Injection". */
  category?: string;
  /** Analyzer that produced the finding, e.g. "Bandit" or "CodeSentry rules". */
  analyzer?: string;
  references?: string[];
}

export type AIVerdict = 'likely_true_positive' | 'needs_manual_verification' | 'likely_false_positive';

export interface AIFindingReview {
  finding_id: string;
  rule_id: string;
  verdict: AIVerdict;
  explanation: string;
  why_problem: string;
  impact: string;
  recommended_fix: string;
  corrected_code: string;
  ai_generated: true;
  disclaimer: string;
}

export interface CoverageReport {
  repository_files: number;
  files_scanned: number;
  code_files_scanned: number;
  config_files_scanned: number;
  dependency_manifests: number;
  files_skipped: number;
  skipped: Record<string, number>;
  skipped_examples: { path: string; reason: string }[];
  unsupported_languages: Record<string, number>;
  analysis_failures: { path: string; reason: string }[];
  bandit_status: string;
  dependency_scan: {
    status: 'not_applicable' | 'disabled' | 'completed' | 'partial' | 'unavailable';
    manifests: string[];
    packages_checked: number;
    unpinned_dependencies: number;
    vulnerable_packages: number;
    parse_errors: string[];
    source: string;
  };
  coverage_ratio: number;
  coverage_status: 'complete' | 'partial' | 'minimal' | 'none';
  languages: Record<string, { files: number; loc: number; analyzers: string[] }>;
}

export interface SecurityStatus {
  code: string;
  label: string;
  message: string;
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
  verdict?: AIVerdict;
  ai_generated?: boolean;
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
    error_code?: string | null;
    model?: string;
    recommendations?: Array<{
      rule_id: string;
      finding_id?: string;
      explanation: string;
      suggested_code: string;
      best_practice: string;
      verdict?: AIVerdict;
    }>;
    findings?: Record<string, AIFindingReview>;
    repository_review?: string | null;
    reviewed_finding_count?: number;
    requested_finding_count?: number;
    disclaimer?: string;
  };
  coverage?: CoverageReport;
  security_status?: SecurityStatus;
  risk_explanation?: string;
  risk_points?: number;
  category_counts?: Record<string, number>;
  saved_to_history?: boolean;
  storage_truncated?: boolean;
  repository_private?: boolean;
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
    dependencies?: number;
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
