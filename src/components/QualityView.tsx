/**
 * @file src/components/QualityView.tsx
 * Python code quality metrics view showing cyclomatic complexity and per-file indicators.
 */

import React from 'react';
import { Sparkles, Code2, AlertCircle, Info } from 'lucide-react';
import { ScanResult } from '../types';

interface QualityViewProps {
  currentScan: ScanResult | null;
}

export const QualityView: React.FC<QualityViewProps> = ({ currentScan }) => {
  if (!currentScan) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <Sparkles className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Quality Metrics Available</h3>
        <p className="text-xs text-slate-500 mt-1">Run a scan to measure code quality and maintainability.</p>
      </div>
    );
  }

  const qualityFindings = currentScan.findings.filter(f => f.source === 'quality');
  const totalLoc = currentScan.file_metrics.reduce((acc, m) => acc + m.loc, 0);
  const avgComplexity = (
    currentScan.file_metrics.reduce((acc, m) => acc + m.cyclomatic_complexity, 0) /
    Math.max(currentScan.file_metrics.length, 1)
  ).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span>Code Quality & Maintainability</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Complexity, function length and finding-density indicators from the backend analysis (complexity metrics are computed for Python files).
        </p>
      </div>

      {/* Score and Formula Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Repository Quality Score</span>
            <div className="text-3xl font-extrabold text-emerald-400 font-mono mt-1">
              {currentScan.quality_score}
              <span className="text-sm text-slate-400 font-normal"> / 100</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Normalized maintainability index</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 md:col-span-2 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>Documented Quality Formula</span>
          </div>
          <p className="text-xs font-mono text-cyan-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            QualityScore = 100 - min(100, (WeightedIssues / TotalLOC) * 1000 * 0.45)
          </p>
          <p className="text-[11px] text-slate-400">
            Weighted by issue severity (High: 5.0, Medium: 2.0, Low: 0.8). Normalizing by LOC ensures large repositories are not unfairly penalized for natural size.
          </p>
        </div>
      </div>

      {/* Per-File Quantitative Metrics Table */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Per-File AST Quantitative Metrics ({currentScan.file_metrics.length} files)
          </span>
          <span className="text-xs text-slate-400">Total LOC: {totalLoc} | Avg Complexity: {avgComplexity}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="p-3">File Path</th>
                <th className="p-3">Language</th>
                <th className="p-3 text-right">LOC</th>
                <th className="p-3 text-right">Funcs</th>
                <th className="p-3 text-right">Classes</th>
                <th className="p-3 text-right">Max Nest</th>
                <th className="p-3 text-right">Loops</th>
                <th className="p-3 text-right">Complexity</th>
                <th className="p-3 text-right">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {currentScan.file_metrics.map((m) => (
                <tr key={m.path} className="hover:bg-slate-850/50 transition-colors">
                  <td className="p-3 text-cyan-300 font-medium truncate max-w-xs">{m.path}</td>
                  <td className="p-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {m.language || 'Code'}
                    </span>
                  </td>
                  <td className="p-3 text-right">{m.loc}</td>
                  <td className="p-3 text-right">{m.functions}</td>
                  <td className="p-3 text-right">{m.classes}</td>
                  <td className="p-3 text-right">{m.max_nesting}</td>
                  <td className="p-3 text-right">{m.nested_loops}</td>
                  <td className={`p-3 text-right font-bold ${m.cyclomatic_complexity > 15 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {m.cyclomatic_complexity}
                  </td>
                  <td className="p-3 text-right">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px]">
                      {m.bug_count + m.security_count + m.quality_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quality Findings List */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Detected Quality & Style Findings ({qualityFindings.length})
        </h3>
        {qualityFindings.length === 0 ? (
          <p className="text-xs text-slate-500">No quality issues identified.</p>
        ) : (
          qualityFindings.map((f) => (
            <div key={f.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-cyan-400 font-semibold">{f.rule_id}</span>
                  <span className="font-medium text-slate-200">{f.title}</span>
                </div>
                <span className="font-mono text-slate-400 text-[11px]">{f.file_path}:{f.line_start}</span>
              </div>
              <p className="text-xs text-slate-400">{f.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
