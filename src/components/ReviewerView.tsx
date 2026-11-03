/**
 * @file src/components/ReviewerView.tsx
 * Context-aware AI Code Reviewer displaying Before/After diffs, unified .patch downloads,
 * and syntax verification badges.
 */

import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  Copy,
  Download,
  Check,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  FileCode,
  Info,
} from 'lucide-react';
import { Finding, ScanResult, AIReview } from '../types';
import { generateAIReview, generateUnifiedDiff } from '../services/geminiService';

interface ReviewerViewProps {
  currentScan: ScanResult | null;
  selectedFinding: Finding | null;
  onSelectFinding: (finding: Finding) => void;
}

export const ReviewerView: React.FC<ReviewerViewProps> = ({
  currentScan,
  selectedFinding,
  onSelectFinding,
}) => {
  const [activeFinding, setActiveFinding] = useState<Finding | null>(selectedFinding);
  const [review, setReview] = useState<AIReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedFinding) {
      setActiveFinding(selectedFinding);
    } else if (currentScan && currentScan.findings.length > 0 && !activeFinding) {
      setActiveFinding(currentScan.findings[0]);
    }
  }, [selectedFinding, currentScan]);

  // Reset when the finding changes; reuse the repository-level AI review when it already covers this finding.
  useEffect(() => {
    setError(null);
    if (!activeFinding) {
      setReview(null);
      return;
    }
    const batch = currentScan?.ai_review?.findings?.[activeFinding.id];
    setReview(
      batch
        ? {
            finding_ids: [activeFinding.id],
            verdict: batch.verdict,
            explanation: batch.explanation,
            why_problematic: batch.why_problem,
            impact: batch.impact,
            original_snippet: activeFinding.context || activeFinding.snippet || '',
            corrected_snippet: batch.corrected_code,
            change_explanation: batch.recommended_fix,
            prevention: '',
            disclaimer: batch.disclaimer,
            ai_generated: true,
          }
        : null
    );
  }, [activeFinding, currentScan]);

  const requestReview = async () => {
    if (!activeFinding) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateAIReview(activeFinding, activeFinding.context || activeFinding.snippet || '');
      setReview(result);
    } catch (err) {
      setReview(null);
      setError(err instanceof Error ? err.message : 'The AI review could not be generated.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentScan) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <GitCompare className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Review Active</h3>
        <p className="text-xs text-slate-500 mt-1">Scan a repository to trigger context-aware AI fixes.</p>
      </div>
    );
  }

  const handleCopy = () => {
    if (review?.corrected_snippet) {
      navigator.clipboard.writeText(review.corrected_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadPatch = () => {
    if (!review || !activeFinding || !review.corrected_snippet) return;
    // Context snippets start up to 4 lines before the flagged line (see backend findings.line_context).
    const contextStart = activeFinding.context ? Math.max(1, activeFinding.line_start - 4) : activeFinding.line_start;
    const patchContent = generateUnifiedDiff(
      activeFinding.file_path,
      review.original_snippet,
      review.corrected_snippet,
      contextStart
    );
    const blob = new Blob([patchContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeFinding.rule_id}-${activeFinding.file_path.replace(/[/\\.]/g, '_')}.patch`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <GitCompare className="w-5 h-5 text-cyan-400" />
            <span>AI Code Reviewer & Diff Engine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gemini explains the selected scanner finding and proposes a fix. Suggestions are not verified — review and test them.
          </p>
        </div>

        {/* Finding Selector Dropdown */}
        <div className="w-full sm:w-auto">
          <select
            value={activeFinding?.id || ''}
            onChange={(e) => {
              const f = currentScan.findings.find(item => item.id === e.target.value);
              if (f) {
                setActiveFinding(f);
                onSelectFinding(f);
              }
            }}
            className="w-full sm:w-80 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono truncate"
          >
            {currentScan.findings.map(f => (
              <option key={f.id} value={f.id}>
                [{f.severity}] {f.rule_id} - {f.title} ({f.file_path}:{f.line_start})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Persistent Disclaimer Banner */}
      <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>AI-generated suggestion. Review and test thoroughly before applying to production.</span>
        </div>
        <span className="text-[10px] text-amber-300 font-mono uppercase bg-amber-900/50 px-2 py-0.5 rounded border border-amber-700">
          Non-Destructive Sandbox
        </span>
      </div>

      {activeFinding && !isLoading && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={requestReview}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{review ? 'Regenerate AI review' : 'Generate AI review for this finding'}</span>
          </button>
          {!review && !error && (
            <span className="text-[11px] text-slate-400">The review is generated on the server with Gemini; your code is redacted for secrets first.</span>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2" role="alert">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>AI review unavailable: {error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-16 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-cyan-400 mx-auto animate-pulse" />
          <p className="text-xs text-slate-300">Generating context-aware remediation & diff...</p>
        </div>
      ) : review && activeFinding ? (
        <div className="space-y-6">
          {/* Active Finding Summary Card */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-xs font-mono font-bold">
                  {activeFinding.rule_id}
                </span>
                {activeFinding.cwe && (
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-xs font-mono font-bold">
                    {activeFinding.cwe}
                  </span>
                )}
                <h2 className="text-sm font-semibold text-slate-100">{activeFinding.title}</h2>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {activeFinding.file_path} (Lines {activeFinding.line_start} - {activeFinding.line_end})
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <span className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-800 text-[11px] font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{review.verdict === 'likely_true_positive' ? 'AI: likely real' : review.verdict === 'likely_false_positive' ? 'AI: possibly false positive' : 'AI: verify manually'} · unverified fix</span>
              </span>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Fix'}</span>
              </button>
              <button
                onClick={handleDownloadPatch}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .patch</span>
              </button>
            </div>
          </div>

          {/* Side-by-Side Before & After Diff Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original Snippet */}
            <div className="rounded-2xl bg-slate-950 border border-rose-900/60 overflow-hidden shadow-xl">
              <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-900/60 flex items-center justify-between text-xs text-rose-300 font-medium">
                <span>Original Code (Flagged)</span>
                <span className="font-mono text-[10px] text-rose-400">Lines {activeFinding.line_start}-{activeFinding.line_end}</span>
              </div>
              <pre className="p-4 font-mono text-[11px] text-rose-200/90 overflow-x-auto leading-relaxed">
                {review.original_snippet}
              </pre>
            </div>

            {/* AI-Corrected Snippet */}
            <div className="rounded-2xl bg-slate-950 border border-emerald-900/60 overflow-hidden shadow-xl">
              <div className="px-4 py-2.5 bg-emerald-950/40 border-b border-emerald-900/60 flex items-center justify-between text-xs text-emerald-300 font-medium">
                <span>AI-Remediated Code (Proposed Fix)</span>
                <span className="font-mono text-[10px] text-amber-300">Not verified</span>
              </div>
              <pre className="p-4 font-mono text-[11px] text-emerald-200/90 overflow-x-auto leading-relaxed">
                {review.corrected_snippet || 'Gemini did not propose replacement code for this finding.'}
              </pre>
            </div>
          </div>

          {/* AI Reasoning & Prevention Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Why Problematic & Impact</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{review.why_problematic}</p>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-rose-300">
                <strong>Impact: </strong>{review.impact}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Remediation Rationale & Prevention</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{review.change_explanation}</p>
              {review.prevention && (
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-cyan-300">
                  <strong>Prevention: </strong>{review.prevention}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {review?.explanation && !isLoading && (
        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">AI explanation</h3>
          <p className="text-xs text-slate-300 leading-relaxed">{review.explanation}</p>
          <p className="text-[10px] text-slate-500">{review.disclaimer}</p>
        </div>
      )}
    </div>
  );
};
