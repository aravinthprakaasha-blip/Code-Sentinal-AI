/**
 * @file src/components/CodeSandboxView.tsx
 * Interactive Self-Text / Code Editor & Automated Error-Correction Studio.
 * Allows users to paste/write Python source, load example snippets,
 * detect bugs and vulnerabilities, and automatically apply error corrections with side-by-side diffs.
 */

import React, { useState, useEffect } from 'react';
import {
  Code2,
  Play,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  FileCode,
  ArrowRight,
  Split,
  Eye,
  ShieldCheck,
  Terminal,
  Layers,
} from 'lucide-react';
import { Finding, ScanResult } from '../types';
import { FileData } from '../services/analyzerService';
import { analyzeFilesOnBackend } from '../services/apiService';
import { SUPPORTED_UPLOAD_PATTERN } from './ScannerView';
import {
  CODE_EXAMPLES,
  CodeExample,
  autoCorrectCodeSnippet,
  AutoCorrectionResult,
} from '../services/remediationService';

interface CodeSandboxViewProps {
  onScanComplete?: (scan: ScanResult) => void;
  onNavigateReviewer?: (finding: Finding) => void;
}

export const CodeSandboxView: React.FC<CodeSandboxViewProps> = ({
  onScanComplete,
  onNavigateReviewer,
}) => {
  const [selectedExampleId, setSelectedExampleId] = useState<string>('py-sqli-div');
  const [fileName, setFileName] = useState<string>('user_analytics.py');
  const [codeText, setCodeText] = useState<string>('');
  const [originalBackup, setOriginalBackup] = useState<string>('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [lastCorrection, setLastCorrection] = useState<AutoCorrectionResult | null>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'diff' | 'explanation'>('editor');
  const [copied, setCopied] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ message: string; isError: boolean } | null>(null);

  // Initialize with first example
  useEffect(() => {
    loadExample(CODE_EXAMPLES[0]);
  }, []);

  const loadExample = (example: CodeExample) => {
    setSelectedExampleId(example.id);
    setFileName(example.fileName);
    setCodeText(example.code);
    setOriginalBackup(example.code);
    setFindings([]);
    setRiskScore(null);
    setLastCorrection(null);
    setViewMode('editor');
    setBanner(null);

    // Auto-analyze example on load for immediate feedback
    analyzeSnippet(example.code, example.fileName, example.language);
  };

  const handleCustomTextReset = () => {
    setCodeText('');
    setOriginalBackup('');
    setFindings([]);
    setRiskScore(null);
    setLastCorrection(null);
    setSelectedExampleId('custom');
    setFileName('custom_script.py');
    setBanner(null);
  };

  const analyzeSnippet = async (codeToTest: string, path: string, langHint?: string) => {
    if (!codeToTest.trim()) return;
    if (!SUPPORTED_UPLOAD_PATTERN.test(path)) {
      setBanner({ message: 'Unsupported file type. Use an extension such as .py, .js, .ts, .java, .go, .php, .rb, .c or .rs.', isError: true });
      setFindings([]);
      setRiskScore(null);
      return;
    }
    setIsAnalyzing(true);
    setBanner(null);

    try {
      const files: FileData[] = [{ path, content: codeToTest, language: langHint }];
      // Sandbox experiments are not written to the user's analysis history.
      const scan = await analyzeFilesOnBackend('self-code-snippet', files, 'local://sandbox', { saveHistory: false });

      setFindings(scan.findings);
      setRiskScore(scan.risk_score);

      if (onScanComplete) {
        onScanComplete(scan);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed.';
      console.error(message);
      setBanner({ message: `Analysis failed: ${message}`, isError: true });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunFindBugs = () => {
    analyzeSnippet(codeText, fileName);
  };

  const handleAutoCorrectAll = async () => {
    if (findings.length === 0) return;

    // Detect language from extension
    const ext = fileName.split('.').pop() || 'py';
    const lang = ext === 'js' ? 'JavaScript' : ext === 'go' ? 'Go' : ext === 'rs' ? 'Rust' : ext === 'c' ? 'C' : 'Python';
    const result = autoCorrectCodeSnippet(codeText, lang, findings);
    if (result.remediatedCount === 0) {
      setBanner({ message: 'None of the current findings has a built-in correction template. Use the AI Reviewer for suggested fixes.', isError: false });
      return;
    }
    setLastCorrection(result);
    setCodeText(result.correctedCode);

    // Re-analyze the corrected code so the user sees what remains.
    setIsAnalyzing(true);
    try {
      const reanalyzed = await analyzeFilesOnBackend(
        'self-code-snippet',
        [{ path: fileName, content: result.correctedCode }],
        'local://sandbox',
        { saveHistory: false }
      );
      setFindings(reanalyzed.findings);
      setRiskScore(reanalyzed.risk_score);
      setBanner({
        message: `Applied ${result.remediatedCount} correction template(s) and re-analyzed the code. Current rule-based risk score: ${reanalyzed.risk_score}/100.`,
        isError: false,
      });
      setViewMode('diff');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Re-analysis failed.';
      setFindings([]);
      setRiskScore(null);
      setBanner({ message: `Correction was applied, but re-analysis failed: ${message}`, isError: true });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFixSingleFinding = async (finding: Finding) => {
    const ext = fileName.split('.').pop() || 'py';
    const lang = ext === 'js' ? 'JavaScript' : ext === 'go' ? 'Go' : ext === 'rs' ? 'Rust' : ext === 'c' ? 'C' : 'Python';

    const result = autoCorrectCodeSnippet(codeText, lang, [finding]);
    if (result.remediatedCount === 0) {
      setBanner({ message: `No correction template is available for ${finding.rule_id}. Use the AI Reviewer for a suggested fix.`, isError: false });
      return;
    }
    if (result.remediatedCount > 0) {
      setLastCorrection(result);
      setCodeText(result.correctedCode);

      // Re-scan
      setIsAnalyzing(true);
      try {
        const reanalyzed = await analyzeFilesOnBackend(
          'self-code-snippet',
          [{ path: fileName, content: result.correctedCode }],
          'local://sandbox',
          { saveHistory: false }
        );
        setFindings(reanalyzed.findings);
        setRiskScore(reanalyzed.risk_score);
        setBanner({
          message: `Applied a correction template for ${finding.title} and re-analyzed the code.`,
          isError: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Re-analysis failed.';
        setFindings([]);
        setRiskScore(null);
        setBanner({ message: `Correction was applied, but re-analysis failed: ${message}`, isError: true });
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleRestoreOriginal = () => {
    if (originalBackup) {
      setCodeText(originalBackup);
      analyzeSnippet(originalBackup, fileName);
      setLastCorrection(null);
      setViewMode('editor');
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = codeText.split('\n');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800/80 text-cyan-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                <span>Self Text & Auto-Corrector Studio</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Interactive Sandbox
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Analyze Python snippets on the secure backend, review findings, and apply clearly identified correction templates.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Header */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleRestoreOriginal}
            disabled={!originalBackup || originalBackup === codeText}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-all disabled:opacity-40 cursor-pointer"
            title="Restore original text before corrections"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Original</span>
          </button>

          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>
      </div>

      {/* Preset Code Examples Selector */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select Pre-Loaded Buggy Example Snippet:</span>
          </span>
          <button
            type="button"
            onClick={handleCustomTextReset}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
          >
            Write Blank / Own Text
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {CODE_EXAMPLES.map((ex) => {
            const isSelected = selectedExampleId === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => loadExample(ex)}
                className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gradient-to-br from-blue-900/50 to-cyan-900/40 border-cyan-600 text-cyan-100 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400">
                      {ex.language}
                    </span>
                    <FileCode className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="text-xs font-semibold text-slate-200 leading-snug">
                    {ex.name}
                  </div>
                </div>
                <div className="text-[10px] text-rose-400/90 mt-2 font-mono truncate">
                  {ex.expectedBugs[0]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Success / Remediated Banner */}
      {banner && (
        <div className={`p-3.5 rounded-xl ${banner.isError ? 'bg-rose-950/60 border-rose-800/80 text-rose-200' : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'} border text-xs flex items-center justify-between shadow-lg`}>
          <div className="flex items-center space-x-2">
            {banner.isError ? <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span>{banner.message}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-xs hover:opacity-80 ml-4 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Studio Grid: Editor / Diff on Left, Bug Findings & Auto-Correction on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Code Text Editor & Mode Toggles */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl flex flex-col h-full">
            {/* Top Toolbar */}
            <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => {
                    setFileName(e.target.value);
                    setFindings([]);
                    setRiskScore(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  placeholder="script.py"
                />
                <span className="text-[11px] text-slate-500 font-mono">
                  {lines.length} lines • {codeText.length} chars
                </span>
              </div>

              {/* View Mode Switches */}
              <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode('editor')}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    viewMode === 'editor'
                      ? 'bg-cyan-900/60 text-cyan-200 border border-cyan-800/80'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('diff')}
                  disabled={!lastCorrection}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-40 ${
                    viewMode === 'diff'
                      ? 'bg-cyan-900/60 text-cyan-200 border border-cyan-800/80'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={!lastCorrection ? 'Auto-correct code to view before/after diff' : ''}
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>Diff (Before/After)</span>
                </button>
              </div>
            </div>

            {/* Code Content Area */}
            {viewMode === 'editor' ? (
              <div className="relative flex-1 min-h-[460px] bg-slate-950 flex font-mono text-xs">
                {/* Line Numbers */}
                <div className="select-none py-3 px-2 bg-slate-950/80 text-slate-600 border-r border-slate-800/60 text-right w-10 shrink-0 space-y-0 leading-relaxed font-mono">
                  {lines.map((_, i) => (
                    <div key={i} className="h-5">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Textarea */}
                <textarea
                  value={codeText}
                  onChange={(e) => {
                    setCodeText(e.target.value);
                    setFindings([]);
                    setRiskScore(null);
                  }}
                  placeholder="Paste or type any source code snippet here..."
                  className="w-full h-full p-3 bg-transparent text-slate-200 focus:outline-none resize-none leading-relaxed font-mono selection:bg-cyan-500/30 selection:text-cyan-200"
                  rows={20}
                  spellCheck={false}
                />
              </div>
            ) : (
              /* Side-by-Side or Unified Diff View */
              <div className="flex-1 min-h-[460px] p-4 bg-slate-950 font-mono text-xs overflow-x-auto space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Error Correction Diffs ({lastCorrection?.remediatedCount || 0} Fixes Applied)
                  </span>
                  <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Defensive Patterns Applied</span>
                  </span>
                </div>

                {lastCorrection?.corrections && lastCorrection.corrections.length > 0 ? (
                  <div className="space-y-4">
                    {lastCorrection.corrections.map((corr, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-cyan-300">
                            Line {corr.line}: {corr.title} ({corr.rule_id})
                          </span>
                          <span className="text-slate-400">{corr.explanation}</span>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                          {/* Original Red Lines */}
                          <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 font-mono">
                            <span className="text-rose-500 font-bold mr-2">- ORIGINAL (BUGGY):</span>
                            <pre className="whitespace-pre-wrap mt-1">{corr.before}</pre>
                          </div>
                          {/* Corrected Green Lines */}
                          <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 font-mono">
                            <span className="text-emerald-500 font-bold mr-2">+ CORRECTED (SECURE):</span>
                            <pre className="whitespace-pre-wrap mt-1">{corr.after}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    No active diff. Apply a correction template to see its before/after comparison.
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Static AST + Security Rule Parser</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleRunFindBugs}
                  disabled={isAnalyzing || !codeText.trim()}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-300" />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Find Bugs & Vulnerabilities'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoCorrectAll}
                  disabled={findings.length === 0 || isAnalyzing}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/25 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Wand2 className="w-4 h-4 text-cyan-200" />
                  <span>Apply Correction Templates</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Detected Bugs & Error-Correction Remediation Details */}
        <div className="lg:col-span-5 space-y-4">
          {/* Health & Score Card */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Security & Bug Diagnostic
              </span>
              {riskScore !== null && (
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    riskScore >= 80
                      ? 'bg-rose-950 text-rose-300 border-rose-800'
                      : riskScore >= 60
                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  }`}
                >
                  Risk Score: {riskScore}/100 ({riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW'})
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="text-lg font-bold text-rose-400">
                  {findings.filter(f => f.severity === 'HIGH').length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">High Severity</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="text-lg font-bold text-amber-400">
                  {findings.filter(f => f.source === 'bug').length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">AST Bugs</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="text-lg font-bold text-cyan-400">
                  {findings.filter(f => f.source === 'security').length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Security Flaws</div>
              </div>
            </div>
          </div>

          {/* Findings List */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Detected Issues in Code ({findings.length})</span>
              </h2>
              {findings.length > 0 && (
                <span className="text-[11px] text-amber-400 font-medium">Review & Correct</span>
              )}
            </div>

            {findings.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500/60" />
                <div className="text-xs font-semibold text-slate-300">No Findings Reported</div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  {riskScore === 0
                    ? 'No issues were reported by the configured scanners.'
                    : 'Click "Find Bugs & Vulnerabilities" or load one of the examples above.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {findings.map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/70 space-y-2 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                              f.severity === 'HIGH'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            {f.rule_id}
                          </span>
                          {f.cwe && (
                            <span className="text-[10px] font-mono text-slate-400">
                              [{f.cwe}]
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-200">
                          {f.title}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        Line {f.line_start}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {f.description}
                    </p>

                    {f.snippet && (
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                        <pre>{f.snippet}</pre>
                      </div>
                    )}

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500 italic">
                        {f.is_heuristic ? 'Static candidate' : 'Confirmed pattern'}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleFixSingleFinding(f)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900/80 border border-cyan-800 text-cyan-200 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Wand2 className="w-3 h-3 text-cyan-400" />
                        <span>Auto-Fix This Bug</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
