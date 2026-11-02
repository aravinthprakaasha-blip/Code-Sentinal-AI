/**
 * @file src/components/SecurityView.tsx
 * Bandit Security Vulnerability Audit view with CWE mapping and remediation guidance.
 */

import React, { useState } from 'react';
import { ShieldAlert, Sparkles, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Finding, ScanResult, SeverityLevel } from '../types';

interface SecurityViewProps {
  currentScan: ScanResult | null;
  onSelectFindingForReview: (finding: Finding) => void;
}

export const SecurityView: React.FC<SecurityViewProps> = ({ currentScan, onSelectFindingForReview }) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>('ALL');
  const [languageFilter, setLanguageFilter] = useState<string>('ALL');
  const [cweFilter, setCweFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!currentScan) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <ShieldAlert className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Security Scan Available</h3>
        <p className="text-xs text-slate-500 mt-1">Execute a scan to view vulnerability findings.</p>
      </div>
    );
  }

  const secFindings = currentScan.findings.filter(f => f.source === 'security');
  const uniqueCwes = Array.from(new Set(secFindings.map(f => f.cwe).filter(Boolean)));
  const uniqueLanguages = Array.from(new Set(secFindings.map(f => f.language).filter(Boolean))) as string[];

  const filtered = secFindings.filter(f => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (cweFilter !== 'ALL' && f.cwe !== cweFilter) return false;
    if (languageFilter !== 'ALL' && f.language !== languageFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Polyglot Security Vulnerability Audit</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Bandit, Semgrep, and static security rules mapped directly to MITRE Common Weakness Enumeration (CWE) standards across all programming languages.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value="ALL">All Languages</option>
            {uniqueLanguages.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select
            value={cweFilter}
            onChange={(e) => setCweFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="ALL">All CWEs</option>
            {uniqueCwes.map(cwe => (
              <option key={cwe} value={cwe}>{cwe}</option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Severities</option>
            <option value="HIGH">High Severity</option>
            <option value="MEDIUM">Medium Severity</option>
            <option value="LOW">Low Severity</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
          <p className="text-sm font-medium text-emerald-400">No security vulnerabilities detected with current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((finding) => {
            const isExpanded = expandedId === finding.id;
            return (
              <div
                key={finding.id}
                className="rounded-xl bg-slate-900/80 border border-slate-800/80 overflow-hidden transition-all hover:border-slate-700"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : finding.id)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                        finding.severity === 'HIGH'
                          ? 'bg-rose-950 text-rose-400 border-rose-800'
                          : finding.severity === 'MEDIUM'
                          ? 'bg-amber-950 text-amber-400 border-amber-800'
                          : 'bg-blue-950 text-blue-400 border-blue-800'
                      }`}
                    >
                      {finding.severity}
                    </span>

                    {finding.language && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        {finding.language}
                      </span>
                    )}

                    {finding.cwe && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-800/80">
                        {finding.cwe}
                      </span>
                    )}

                    <span className="font-mono text-xs text-slate-400 font-semibold">{finding.rule_id}</span>
                    <span className="text-xs font-medium text-slate-200">{finding.title}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    <span className="font-mono text-slate-400 text-[11px] truncate max-w-[220px]">
                      {finding.file_path}:{finding.line_start}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 bg-slate-950/40 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Confidence Level: <strong className="text-slate-200 font-mono">{finding.confidence}</strong></span>
                      {finding.cwe && (
                        <a
                          href={`https://cwe.mitre.org/data/definitions/${finding.cwe.replace('CWE-', '')}.html`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline flex items-center space-x-1"
                        >
                          <span>MITRE CWE Details</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{finding.description}</p>

                    {finding.snippet && (
                      <div className="rounded-lg bg-black/80 border border-slate-800 p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                        <pre>{finding.snippet}</pre>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                      <div className="text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-300">Remediation Guidance: </span>
                        {finding.suggested_fix}
                      </div>

                      <button
                        onClick={() => onSelectFindingForReview(finding)}
                        className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-cyan-600/20 cursor-pointer shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                        <span>Generate AI Patch</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
