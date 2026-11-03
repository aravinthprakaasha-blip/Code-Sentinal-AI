/**
 * @file src/components/BugsView.tsx
 * AST Bug Detection view with rule filters, candidate tags, and AI remediation triggers.
 */

import React, { useState } from 'react';
import { Bug, Filter, Sparkles, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { Finding, ScanResult, SeverityLevel } from '../types';
import { AiFindingPanel, severityBadgeClass } from './AiFindingPanel';

interface BugsViewProps {
  currentScan: ScanResult | null;
  onSelectFindingForReview: (finding: Finding) => void;
}

export const BugsView: React.FC<BugsViewProps> = ({ currentScan, onSelectFindingForReview }) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>('ALL');
  const [languageFilter, setLanguageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!currentScan) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <Bug className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Scan Active</h3>
        <p className="text-xs text-slate-500 mt-1">Scan a repository first to inspect AST bug candidates.</p>
      </div>
    );
  }

  const bugFindings = currentScan.findings.filter(f => f.source === 'bug');
  const uniqueLanguages = Array.from(new Set(bugFindings.map(f => f.language).filter(Boolean))) as string[];

  const filteredFindings = bugFindings.filter(f => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (languageFilter !== 'ALL' && f.language !== languageFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        f.title.toLowerCase().includes(q) ||
        f.rule_id.toLowerCase().includes(q) ||
        f.file_path.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Bug className="w-5 h-5 text-amber-400" />
            <span>AST Bug Detection</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Static AST pattern analysis detecting zero-division, infinite loops, bare excepts, and memory issues across all programming languages.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rule or file..."
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />

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
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical Severity</option>
            <option value="HIGH">High Severity</option>
            <option value="MEDIUM">Medium Severity</option>
            <option value="LOW">Low Severity</option>
          </select>
        </div>
      </div>

      {filteredFindings.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
          <p className="text-sm font-medium text-slate-300">No bug candidates matching the selected criteria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map((finding) => {
            const isExpanded = expandedId === finding.id;
            return (
              <div
                key={finding.id}
                className="rounded-xl bg-slate-900/80 border border-slate-800/80 overflow-hidden transition-all hover:border-slate-700"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : finding.id)}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 cursor-pointer select-none"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${severityBadgeClass(finding.severity)}`}
                    >
                      {finding.severity}
                    </span>

                    {finding.language && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        {finding.language}
                      </span>
                    )}

                    <span className="font-mono text-xs text-cyan-400 font-semibold">{finding.rule_id}</span>

                    <span className="text-xs font-medium text-slate-200">{finding.title}</span>

                    {finding.is_heuristic && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                        Candidate
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    <span className="font-mono text-slate-400 text-[11px] truncate max-w-[220px]">
                      {finding.file_path}:{finding.line_start}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 bg-slate-950/40 space-y-3">
                    <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                      {finding.category && <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200">{finding.category}</span>}
                      {finding.analyzer && <span>Detected by <strong className="text-slate-300">{finding.analyzer}</strong></span>}
                      <span>Confidence <strong className="text-slate-300">{finding.confidence}</strong></span>
                      {finding.is_heuristic && <span className="text-amber-300">Heuristic match — verify manually</span>}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{finding.description}</p>

                    {(finding.context || finding.snippet) && (
                      <div className="rounded-lg bg-black/80 border border-slate-800 p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                        <pre>{finding.context || finding.snippet}</pre>
                      </div>
                    )}

                    {finding.references && finding.references.length > 0 && (
                      <div className="flex flex-wrap gap-3 text-[11px]">
                        {finding.references.filter(ref => /^https:\/\//.test(ref)).map(ref => (
                          <a key={ref} href={ref} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline break-all">{ref}</a>
                        ))}
                      </div>
                    )}

                    <AiFindingPanel review={currentScan.ai_review?.findings?.[finding.id]} />

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                      <div className="text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-300">Suggested Correction: </span>
                        {finding.suggested_fix}
                      </div>

                      <button
                        onClick={() => onSelectFindingForReview(finding)}
                        className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-cyan-600/20 cursor-pointer shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                        <span>Ask AI to Explain & Fix</span>
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
