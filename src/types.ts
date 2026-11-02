/**
 * @file src/types.ts
 * Shared data contracts and models for CodeSentry AI polyglot code review.
 */

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'N/A';
export type FindingSource = 'bug' | 'security' | 'quality';
export type RiskLabel = 'LOW' | 'MEDIUM' | 'HIGH';

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
  risk_label: RiskLabel;
  probabilities: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  };
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
  risk_breakdown: {
    security: number;
    bugs: number;
    complexity: number;
    quality: number;
    ml_risk: number;
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
