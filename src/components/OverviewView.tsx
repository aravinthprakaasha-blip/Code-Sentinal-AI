/**
 * @file src/components/OverviewView.tsx
 * Overview dashboard displaying scan stats, composite risk score, breakdown,
 * and recent scan history from Firestore.
 */

import React from 'react';
import {
  ShieldAlert,
  Bug,
  Sparkles,
  FileCode,
  AlertTriangle,
  History,
  Trash2,
  ArrowRight,
  ExternalLink,
  Info,
  Code2,
  ShieldCheck,
  Layers,
  Bot,
} from 'lucide-react';
import { ScanResult } from '../types';

const SKIP_REASON_LABELS: Record<string, string> = {
  vendor_or_generated: 'Dependency / build / generated',
  binary_or_media: 'Binary or media',
  unsupported_type: 'Unsupported language',
  oversized: 'Over size limit',
  not_utf8: 'Not UTF-8 text',
  limit_exceeded: 'Scan limits / download failures',
  documentation_or_other: 'Docs and other non-code files',
};

const VERDICT_LABELS: Record<string, string> = {
  likely_true_positive: 'Likely real',
  needs_manual_verification: 'Needs manual verification',
  likely_false_positive: 'Possibly a false positive',
};

interface OverviewViewProps {
  currentScan: ScanResult | null;
  savedScans: any[];
  historyError?: string | null;
  onSelectSavedScan: (scan: any) => void;
  onDeleteScan: (scanId: string) => void;
  onNavigateScanner: () => void;
  onNavigateSandbox?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  currentScan,
  savedScans,
  historyError,
  onSelectSavedScan,
  onDeleteScan,
  onNavigateScanner,
  onNavigateSandbox,
}) => {
  const historySection = (
    <>
      {historyError && (
        <div className="max-w-4xl mx-auto p-3 rounded-xl bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200" role="alert">
          {historyError}
        </div>
      )}
        {/* Saved Scans from Firestore */}
        {savedScans.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center space-x-2 text-slate-300 font-semibold text-sm">
              <History className="w-4 h-4 text-cyan-400" />
              <span>Your Private Analysis History</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedScans.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">{s.repo_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{s.branch} · risk {s.risk_score} ({s.risk_label}){s.coverage_status && s.coverage_status !== 'complete' ? ` · ${s.coverage_status} coverage` : ''}</p>
                    <p className="text-[10px] text-slate-400">{new Date(s.created_at).toLocaleString()}</p>
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="text-slate-400">{s.file_count} files</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-rose-400">{s.findings_count} findings</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onSelectSavedScan(s)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-medium hover:bg-cyan-900 transition-all cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete the saved analysis of ${s.repo_name}? This cannot be undone.`)) onDeleteScan(s.id);
                      }}
                      aria-label={`Delete analysis of ${s.repo_name}`}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </>
  );

  if (!currentScan) {
    return (
      <div className="space-y-6">
        {/* Empty State Banner */}
        <div className="p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 text-center max-w-2xl mx-auto my-12 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-blue-900/30 border border-blue-700/50 flex items-center justify-center mx-auto mb-4 text-cyan-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">No Active Repository Scanned</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
          Welcome to CodeSentry AI. Scan a GitHub repository or uploaded files for bugs, vulnerabilities, committed secrets and vulnerable dependencies, with an AI explanation of the most important findings.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              onClick={onNavigateScanner}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all cursor-pointer flex items-center space-x-2"
            >
              <span>Scan a GitHub Repository</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            {onNavigateSandbox && (
              <button
                onClick={onNavigateSandbox}
                className="px-5 py-2.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 text-xs font-semibold transition-all cursor-pointer flex items-center space-x-2"
              >
                <Code2 className="w-4 h-4 text-cyan-400" />
                <span>Self Text & Auto-Corrector</span>
              </button>
            )}
          </div>
        </div>

        {historySection}
      </div>
    );
  }

  const bugCount = currentScan.source_counts?.bug ?? currentScan.findings.filter(f => f.source === 'bug').length;
  const secCount = (currentScan.source_counts?.security ?? currentScan.findings.filter(f => f.source === 'security').length)
    + (currentScan.source_counts?.dependency ?? currentScan.findings.filter(f => f.source === 'dependency').length);
  const coverage = currentScan.coverage;
  const status = currentScan.security_status;
  const ai = currentScan.ai_review;
  const coveragePercent = coverage ? Math.round(coverage.coverage_ratio * 100) : null;
  const findingById = new Map(currentScan.findings.map(f => [f.id, f]));
  const qualCount = currentScan.source_counts?.quality ?? currentScan.findings.filter(f => f.source === 'quality').length;
  const highCount = currentScan.severity_counts?.HIGH ?? currentScan.findings.filter(f => f.severity === 'HIGH').length;
  const medCount = currentScan.severity_counts?.MEDIUM ?? currentScan.findings.filter(f => f.severity === 'MEDIUM').length;
  const lowCount = currentScan.severity_counts?.LOW ?? currentScan.findings.filter(f => f.severity === 'LOW').length;
  const criticalCount = currentScan.severity_counts?.CRITICAL ?? 0;
  const informationalCount = currentScan.severity_counts?.INFORMATIONAL ?? 0;

  const hasHighRisk = highCount > 0 || currentScan.risk_score >= 65;
  const hasMedRisk = medCount > 0 || currentScan.risk_score >= 35;
  const riskLabel = currentScan.risk_label || (hasHighRisk ? 'HIGH' : hasMedRisk ? 'MEDIUM' : 'LOW');
  const riskColor =
    riskLabel === 'HIGH' || riskLabel === 'CRITICAL'
      ? 'text-rose-400'
      : riskLabel === 'MEDIUM'
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <div className="space-y-6">
      {/* Target Repo Header Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-slate-100">{currentScan.repo_name}</h1>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">
              branch: {currentScan.branch}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-2">
            <span>Scan completed in {currentScan.duration_seconds.toFixed(2)}s</span>
            <span>•</span>
            <span>{new Date(currentScan.timestamp).toLocaleString()}</span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href={currentScan.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition-all"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onNavigateScanner}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
          >
            New Scan
          </button>
        </div>
      </div>

      {/* Security status */}
      {status && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 ${
            status.code === 'NO_ISSUES_DETECTED'
              ? 'bg-emerald-950/30 border-emerald-900/70'
              : status.code === 'NOT_ANALYZED'
              ? 'bg-slate-900/80 border-slate-700'
              : status.code.startsWith('CRITICAL') || status.code.startsWith('HIGH')
              ? 'bg-rose-950/30 border-rose-900/70'
              : 'bg-amber-950/30 border-amber-900/70'
          }`}
          role="status"
        >
          {status.code === 'NO_ISSUES_DETECTED' ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-100">Security status: {status.label}</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{status.message}</p>
          </div>
        </div>
      )}

      {currentScan.warnings.length > 0 && (
        <details className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/50 text-xs text-amber-200">
          <summary className="cursor-pointer font-medium">{currentScan.warnings.length} warning(s) about this scan</summary>
          <ul className="mt-2 space-y-1 list-disc pl-5 text-amber-100/90">
            {currentScan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Files Scanned</span>
            <FileCode className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 font-mono">{coverage?.files_scanned ?? currentScan.files.length}</p>
          <span className="text-[10px] text-slate-400">
            {coverage ? `${coverage.files_skipped} skipped of ${coverage.repository_files} total` : 'Source files analyzed'}
          </span>
        </div>

        {currentScan.findings_truncated && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/70 text-xs text-amber-200">
            Showing the {currentScan.findings.length} highest-severity findings of {currentScan.total_findings} total. Risk scoring includes all findings.
          </div>
        )}

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Bug Findings</span>
            <Bug className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 font-mono">{bugCount}</p>
          <span className="text-[10px] text-slate-400">Parser, AST and Pyflakes ({qualCount} quality notes)</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Security Findings</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 font-mono">{secCount}</p>
          <span className="text-[10px] text-slate-400">Bandit, rules, secrets, dependencies</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Code Quality</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 font-mono">{currentScan.quality_score}<span className="text-xs text-slate-400">/100</span></p>
          <span className="text-[10px] text-slate-400">KLOC-Normalized Metric</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Overall Risk</span>
            <AlertTriangle className={`w-4 h-4 ${riskColor}`} />
          </div>
          <p className={`text-2xl font-bold font-mono ${riskColor}`}>
            {currentScan.risk_score}
            <span className="text-xs text-slate-400 font-normal ml-1">({riskLabel})</span>
          </p>
          <span className="text-[10px] text-slate-400">Transparent rule-based score</span>
        </div>
      </div>

      {/* Language Composition Breakdown Banner */}
      {currentScan.languages_detected && Object.keys(currentScan.languages_detected).length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Repository Programming Languages ({Object.keys(currentScan.languages_detected).length} Detected)
            </span>
            <span className="text-xs text-cyan-400 font-mono">share of scanned lines</span>
          </div>

          {/* Polyglot colored bar */}
          <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
            {Object.entries(currentScan.languages_detected).map(([lang, stat], idx) => {
              const colors = [
                'bg-blue-500', 'bg-cyan-500', 'bg-purple-500', 'bg-amber-500',
                'bg-rose-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-teal-500'
              ];
              const color = colors[idx % colors.length];
              return (
                <div
                  key={lang}
                  style={{ width: `${stat.percentage}%` }}
                  className={`h-full ${color}`}
                  title={`${lang}: ${stat.percentage}% (${stat.files} files, ${stat.loc} LOC)`}
                />
              );
            })}
          </div>

          {/* Language chips */}
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(currentScan.languages_detected).map(([lang, stat], idx) => {
              const dotColors = [
                'bg-blue-400', 'bg-cyan-400', 'bg-purple-400', 'bg-amber-400',
                'bg-rose-400', 'bg-emerald-400', 'bg-indigo-400', 'bg-teal-400'
              ];
              const dotColor = dotColors[idx % dotColors.length];
              return (
                <div
                  key={lang}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="font-medium text-slate-200">{lang}</span>
                  <span className="text-slate-400 text-[11px] font-mono">({stat.percentage}%)</span>
                  <span className="text-slate-500 text-[10px] font-mono">{stat.files} files</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coverage */}
      {coverage && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> Analysis Coverage
            </span>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded border ${
                coverage.coverage_status === 'complete'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border-amber-800'
              }`}
            >
              {coverage.coverage_status} · {coveragePercent}% of analyzable files fully scanned
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <p className="text-slate-400">Source files</p>
              <p className="text-lg font-mono text-slate-100">{coverage.code_files_scanned}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <p className="text-slate-400">Config / manifests</p>
              <p className="text-lg font-mono text-slate-100">{coverage.config_files_scanned}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <p className="text-slate-400">Skipped</p>
              <p className="text-lg font-mono text-slate-100">{coverage.files_skipped}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <p className="text-slate-400">Analysis failures</p>
              <p className={`text-lg font-mono ${coverage.analysis_failures.length ? 'text-rose-300' : 'text-slate-100'}`}>{coverage.analysis_failures.length}</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1.5">
              <p className="text-slate-300 font-semibold">Analyzers per language</p>
              {Object.entries(coverage.languages).map(([language, info]) => (
                <p key={language} className="text-slate-400">
                  <span className="text-slate-200 font-medium">{language}</span> ({info.files}): {info.analyzers.join(', ')}
                </p>
              ))}
              <p className="text-slate-400">
                <span className="text-slate-200 font-medium">Dependencies</span>: {coverage.dependency_scan.status === 'completed'
                  ? `${coverage.dependency_scan.packages_checked} pinned package(s) checked against OSV.dev`
                  : coverage.dependency_scan.status === 'not_applicable'
                  ? 'no supported manifest found'
                  : `check ${coverage.dependency_scan.status}`}
                {coverage.dependency_scan.unpinned_dependencies > 0 && ` · ${coverage.dependency_scan.unpinned_dependencies} unpinned (not checked)`}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-slate-300 font-semibold">Not scanned</p>
              {Object.entries(coverage.skipped).filter(([, count]) => count > 0).map(([reason, count]) => (
                <p key={reason} className="text-slate-400">{SKIP_REASON_LABELS[reason] || reason}: <span className="font-mono text-slate-200">{count}</span></p>
              ))}
              {Object.keys(coverage.unsupported_languages).length > 0 && (
                <p className="text-amber-300">Unsupported languages: {Object.entries(coverage.unsupported_languages).map(([l, c]) => `${l} (${c})`).join(', ')}</p>
              )}
              {coverage.analysis_failures.map((failure, index) => (
                <p key={index} className="text-rose-300 font-mono break-all">{failure.path}: {failure.reason}</p>
              ))}
              {coverage.skipped_examples.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-cyan-400">Examples of skipped files</summary>
                  <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                    {coverage.skipped_examples.map(item => (
                      <li key={item.path} className="font-mono text-slate-500 break-all">{item.path} — {item.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI review */}
      {ai && ai.status !== 'not_requested' && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Bot className="w-4 h-4 text-cyan-400" /> AI Code Review (Gemini)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
              AI-generated suggestions — not verified fixes
            </span>
          </div>
          {ai.status === 'available' ? (
            <>
              {ai.repository_review && <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{ai.repository_review}</p>}
              <div className="space-y-2">
                {Object.values(ai.findings || {}).map(review => {
                  const finding = findingById.get(review.finding_id);
                  return (
                    <div key={review.finding_id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-slate-400">{review.rule_id}</span>
                        {finding && <span className="text-slate-200 font-medium">{finding.title}</span>}
                        {finding && <span className="font-mono text-slate-500">{finding.file_path}:{finding.line_start}</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          review.verdict === 'likely_true_positive'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : review.verdict === 'likely_false_positive'
                            ? 'bg-slate-800 text-slate-300 border-slate-700'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}>{VERDICT_LABELS[review.verdict] || review.verdict}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{review.explanation}</p>
                      {review.recommended_fix && <p className="text-slate-400"><span className="text-slate-300 font-semibold">Suggested fix: </span>{review.recommended_fix}</p>}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500">
                Reviewed {ai.reviewed_finding_count ?? 0} of the {ai.requested_finding_count ?? 0} most severe findings{ai.model ? ` with ${ai.model}` : ''}. Open a finding in the Security or Bugs view for the full explanation and corrected code.
              </p>
            </>
          ) : (
            <p className="text-xs text-amber-200">AI review unavailable: {(ai.reason || 'unknown reason').replace(/\.$/, '')}. Static analysis results above are unaffected.</p>
          )}
        </div>
      )}

      {/* Main Breakdown Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Risk Score Gauge & Summary Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Repository Risk Index</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                riskLabel === 'HIGH' || riskLabel === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border-rose-800' :
                riskLabel === 'MEDIUM' ? 'bg-amber-950 text-amber-400 border-amber-800' :
                'bg-emerald-950 text-emerald-400 border-emerald-800'
              }`}>
                {riskLabel} RISK
              </span>
            </div>

            {/* Gauge Graphic */}
            <div className="flex flex-col items-center justify-center my-4">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#1e293b"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={riskLabel === 'HIGH' || riskLabel === 'CRITICAL' ? '#f43f5e' : riskLabel === 'MEDIUM' ? '#f59e0b' : '#10b981'}
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - currentScan.risk_score / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-extrabold text-slate-100 font-mono">{currentScan.risk_score}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Score / 100</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-start space-x-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p>
                Transparent rule-based score from the findings above{coverage && coverage.coverage_status !== 'complete' ? ', covering only the files that were scanned' : ''}. Not a certified safety rating.
              </p>
              {currentScan.risk_explanation && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-cyan-400">How is this calculated?</summary>
                  <p className="mt-1 leading-relaxed">{currentScan.risk_explanation}</p>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Weighted Score Breakdown */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Risk Factor Composition</span>
            <span className="text-xs text-slate-400">Capped factor scores, not percentages</span>
          </div>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Security findings</span>
                <span className="font-mono text-rose-400 font-semibold">{currentScan.risk_breakdown?.security || 0}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${currentScan.risk_breakdown?.security || 0}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Vulnerable dependencies</span>
                <span className="font-mono text-orange-400 font-semibold">{currentScan.risk_breakdown?.dependencies || 0}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${currentScan.risk_breakdown?.dependencies || 0}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Bug findings</span>
                <span className="font-mono text-amber-400 font-semibold">{currentScan.risk_breakdown?.bugs || 0}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${currentScan.risk_breakdown?.bugs || 0}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Code quality findings (complexity, unused code)</span>
                <span className="font-mono text-blue-400 font-semibold">{currentScan.risk_breakdown?.complexity || 0}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${currentScan.risk_breakdown?.complexity || 0}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Quality deficits</span>
                <span className="font-mono text-cyan-400 font-semibold">{currentScan.risk_breakdown?.quality || 0}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${currentScan.risk_breakdown?.quality || 0}%` }} />
              </div>
            </div>
          </div>

          {/* Severity Badges Summary */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">Severity Distribution:</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-red-950 text-red-200 border border-red-800 font-mono font-medium">
                {criticalCount} CRITICAL
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono font-medium">
                {highCount} HIGH
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono font-medium">
                {medCount} MEDIUM
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono font-medium">
                {lowCount} LOW
              </span>
              {informationalCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono font-medium">
                  {informationalCount} INFO
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {historySection}
    </div>
  );
};
