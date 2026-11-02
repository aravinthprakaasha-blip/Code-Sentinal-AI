/**
 * @file src/components/MLRiskView.tsx
 * Rule-based risk assessment view with per-file scores and transparent factors.
 */

import React from 'react';
import { Cpu, Info, BarChart2 } from 'lucide-react';
import { ScanResult } from '../types';

interface MLRiskViewProps {
  currentScan: ScanResult | null;
}

export const MLRiskView: React.FC<MLRiskViewProps> = ({ currentScan }) => {
  if (!currentScan) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <Cpu className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Risk Assessment Available</h3>
        <p className="text-xs text-slate-500 mt-1">Execute a scan to generate file-level risk predictions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
          <Cpu className="w-5 h-5 text-purple-400" />
          <span>Rule-Based Risk Assessment</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          A deterministic baseline scores real scanner findings, cyclomatic complexity, and nested loops. It is not a trained ML model.
        </p>
      </div>

      {/* Model Transparency & Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/80 text-xs text-purple-200 flex items-start space-x-3 shadow-lg">
        <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-purple-100">
            Methodological Transparency: Rule-Based Baseline
          </p>
          <p className="text-purple-300 leading-relaxed text-[11px]">
            Risk scores are deterministic heuristics based on confirmed Bandit findings, bug findings, and complexity metrics. They are prioritization estimates, not calibrated probabilities or proof that a defect is exploitable.
          </p>
        </div>
      </div>

      {/* Per-File Predictions Table */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Per-File Risk Estimates ({currentScan.predictions.length} files)
          </span>
          <span className="text-xs text-slate-400">Transparent rule baseline</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="p-3">File Path</th>
                <th className="p-3">Predicted Risk</th>
                <th className="p-3">Rule Score</th>
                <th className="p-3">Top Contributing Factors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {currentScan.predictions.map((p) => {
                const labelColor =
                  p.risk_label === 'CRITICAL' || p.risk_label === 'HIGH'
                    ? 'bg-rose-950 text-rose-400 border-rose-800'
                    : p.risk_label === 'MEDIUM'
                    ? 'bg-amber-950 text-amber-400 border-amber-800'
                    : 'bg-emerald-950 text-emerald-400 border-emerald-800';

                return (
                  <tr key={p.path} className="hover:bg-slate-850/50 transition-colors">
                    <td className="p-3 text-cyan-300 font-medium truncate max-w-xs">{p.path}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${labelColor}`}>
                        {p.risk_label}
                      </span>
                    </td>
                    <td className="p-3">{p.risk_score}/100</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {p.top_features.map((feat, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
                          >
                            {feat}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk factors and calculation details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Current Risk Reasons
            </span>
            <BarChart2 className="w-4 h-4 text-cyan-400" />
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            {(currentScan.risk_reasons || []).map((reason) => (
              <p key={reason} className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">{reason}</p>
            ))}
            {(!currentScan.risk_reasons || currentScan.risk_reasons.length === 0) && (
              <p className="text-slate-400">No elevated risk factors were reported.</p>
            )}
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Baseline Score Components
          </span>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Model</span>
              <span className="font-mono font-semibold text-slate-200">No trained model</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Security findings</span>
              <span className="font-mono font-semibold text-rose-400">Severity weighted</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Bug findings</span>
              <span className="font-mono font-semibold text-amber-400">Severity weighted</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Complexity</span>
              <span className="font-mono font-semibold text-cyan-400">Cyclomatic + loops</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">
            Scores are capped at 100 and use fixed weights in the backend baseline. They are not probabilities, validated predictions, or a substitute for human review.
          </p>
        </div>
      </div>
    </div>
  );
};
