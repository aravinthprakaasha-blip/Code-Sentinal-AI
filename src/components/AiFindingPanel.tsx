/**
 * @file src/components/AiFindingPanel.tsx
 * Shows Gemini's explanation for a single scanner finding, clearly labelled as an AI suggestion.
 */

import React from 'react';
import { Bot } from 'lucide-react';
import { AIFindingReview } from '../types';

const VERDICT_TEXT: Record<string, string> = {
  likely_true_positive: 'AI assessment: likely a real issue',
  needs_manual_verification: 'AI assessment: needs manual verification',
  likely_false_positive: 'AI assessment: possibly a false positive',
};

export const AiFindingPanel: React.FC<{ review?: AIFindingReview }> = ({ review }) => {
  if (!review) return null;
  return (
    <div className="rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="w-3.5 h-3.5 text-cyan-400" />
        <span className="font-semibold text-cyan-200">{VERDICT_TEXT[review.verdict] || review.verdict}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">AI suggestion · not verified</span>
      </div>
      {review.explanation && <p className="text-slate-300 leading-relaxed">{review.explanation}</p>}
      {review.why_problem && <p className="text-slate-400"><span className="text-slate-300 font-semibold">Why it matters: </span>{review.why_problem}</p>}
      {review.impact && <p className="text-slate-400"><span className="text-slate-300 font-semibold">Potential impact: </span>{review.impact}</p>}
      {review.recommended_fix && <p className="text-slate-400"><span className="text-slate-300 font-semibold">Recommended fix: </span>{review.recommended_fix}</p>}
      {review.corrected_code && (
        <div>
          <p className="text-slate-300 font-semibold mb-1">Suggested corrected code</p>
          <pre className="rounded bg-black/80 border border-slate-800 p-2 font-mono text-[11px] text-emerald-200 overflow-x-auto whitespace-pre">{review.corrected_code}</pre>
        </div>
      )}
      <p className="text-[10px] text-slate-500">{review.disclaimer}</p>
    </div>
  );
};

export const severityBadgeClass = (severity: string): string =>
  severity === 'CRITICAL'
    ? 'bg-red-950 text-red-200 border-red-700'
    : severity === 'HIGH'
    ? 'bg-rose-950 text-rose-400 border-rose-800'
    : severity === 'MEDIUM'
    ? 'bg-amber-950 text-amber-400 border-amber-800'
    : severity === 'LOW'
    ? 'bg-blue-950 text-blue-400 border-blue-800'
    : 'bg-slate-800 text-slate-300 border-slate-700';
