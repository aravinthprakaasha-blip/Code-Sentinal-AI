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
} from 'lucide-react';
import { ScanResult } from '../types';

interface OverviewViewProps {
  currentScan: ScanResult | null;
  savedScans: any[];
  onSelectSavedScan: (scan: any) => void;
  onDeleteScan: (scanId: string) => void;
  onNavigateScanner: () => void;
  onNavigateSandbox?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  currentScan,
  savedScans,
  onSelectSavedScan,
  onDeleteScan,
  onNavigateScanner,
  onNavigateSandbox,
}) => {
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
          Welcome to CodeSentry AI. Run server-side Python AST, Pyflakes, and Bandit analysis on a public GitHub repository or uploaded Python source.
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

        {/* Saved Scans from Firestore */}
        {savedScans.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center space-x-2 text-slate-300 font-semibold text-sm">
              <History className="w-4 h-4 text-cyan-400" />
              <span>Saved Scan History (Cloud Firestore)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedScans.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">{s.repo_name}</p>
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
                      onClick={() => onDeleteScan(s.id)}
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
      </div>
    );
  }

  const bugCount = currentScan.source_counts?.bug ?? currentScan.findings.filter(f => f.source === 'bug').length;
  const secCount = currentScan.source_counts?.security ?? currentScan.findings.filter(f => f.source === 'security').length;
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

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Analyzed Files</span>
            <FileCode className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 font-mono">{currentScan.files.length}</p>
          <span className="text-[10px] text-slate-400">Python Files Analyzed</span>
        </div>

        {currentScan.findings_truncated && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/70 text-xs text-amber-200">
            Showing the {currentScan.findings.length} highest-severity findings of {currentScan.total_findings} total. Risk scoring includes all findings.
          </div>
        )}

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">AST Bug Candidates</span>
            <Bug className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 font-mono">{bugCount}</p>
          <span className="text-[10px] text-slate-400">AST and Pyflakes checks</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs">Security Findings</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 font-mono">{secCount}</p>
          <span className="text-[10px] text-slate-400">Bandit scanner findings</span>
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
          <span className="text-[10px] text-slate-400">Composite heuristic</span>
        </div>
      </div>

      {/* Language Composition Breakdown Banner */}
      {currentScan.languages_detected && Object.keys(currentScan.languages_detected).length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Repository Programming Languages ({Object.keys(currentScan.languages_detected).length} Detected)
            </span>
            <span className="text-xs text-cyan-400 font-mono">Python files analyzed</span>
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
            <p>
              Project-specific rule-based score computed from static findings and metrics. Not a certified safety rating.
            </p>
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
                <span className="text-slate-300 font-medium">Bug findings</span>
                <span className="font-mono text-amber-400 font-semibold">{currentScan.risk_breakdown?.bugs || 0}/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${currentScan.risk_breakdown?.bugs || 0}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Cyclomatic complexity and nested loops</span>
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
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Severity Distribution:</span>
            <div className="flex items-center space-x-2">
              {criticalCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-red-950 text-red-200 border border-red-800 font-mono font-medium">
                  {criticalCount} CRITICAL
                </span>
              )}
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
    </div>
  );
};
