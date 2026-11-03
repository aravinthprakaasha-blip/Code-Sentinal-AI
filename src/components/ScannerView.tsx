/**
 * @file src/components/ScannerView.tsx
 * GitHub repository scanner with direct Python source and file ingestion.
 */

import React, { useState } from 'react';
import {
  Search,
  GitBranch,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  FolderGit2,
  Sparkles,
  Lock,
  Upload,
  Code,
  Globe,
} from 'lucide-react';
import {
  parseUniversalRepoUrl,
  POPULAR_PRESET_REPOS,
} from '../services/repoService';
import { FileData } from '../services/analyzerService';
import {
  analyzeFilesOnBackend,
  analyzeRepositoryOnBackend,
  listRepositoryBranches,
} from '../services/apiService';
import { CODE_EXAMPLES } from '../services/remediationService';
import { ScanResult } from '../types';

/** File extensions the backend can analyze (source, configuration, and dependency manifests). */
export const SUPPORTED_UPLOAD_PATTERN =
  /(\.(py|pyi|js|jsx|mjs|cjs|ts|tsx|mts|cts|java|go|php|rb|c|h|cc|cpp|cxx|hpp|rs|sh|bash|zsh|yml|yaml|json|toml|ini|cfg|conf|properties|xml|tf|rules|sql|gradle|env)|(^|\/)(dockerfile[^/]*|\.env[^/]*|requirements[^/]*\.txt|poetry\.lock|pipfile\.lock))$/i;
const SUPPORTED_UPLOAD_ACCEPT =
  '.py,.pyi,.js,.jsx,.mjs,.cjs,.ts,.tsx,.java,.go,.php,.rb,.c,.h,.cc,.cpp,.hpp,.rs,.sh,.yml,.yaml,.json,.toml,.ini,.cfg,.conf,.properties,.xml,.tf,.rules,.sql,.txt,.lock,.env';

interface ScannerViewProps {
  onScanComplete: (scan: ScanResult) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
}

interface ScanStep {
  id: number;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

type ScanMode = 'url' | 'paste' | 'upload';

export const ScannerView: React.FC<ScannerViewProps> = ({
  onScanComplete,
  isScanning,
  setIsScanning,
}) => {
  const [scanMode, setScanMode] = useState<ScanMode>('url');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customFileName, setCustomFileName] = useState('app.py');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesFor, setBranchesFor] = useState('');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);
  const [githubToken, setGithubToken] = useState('');

  const stepLabels = [
    'Validate the repository URL or uploaded file paths',
    'Retrieve repository metadata, branch and source files (code is never executed)',
    'Static analysis: Python AST, Pyflakes, Bandit, multi-language rules, secrets, dependencies',
    'AI review of top findings (Gemini, backend only), risk scoring and saving to private history',
  ];
  const steps: ScanStep[] = stepLabels.map((label, index) => ({
    id: index + 1,
    label,
    status:
      failedStep === index
        ? 'error'
        : activeStepIndex > index
        ? 'completed'
        : activeStepIndex === index && isScanning
        ? 'active'
        : 'pending',
  }));

  const normalizeRepoInput = (value: string) => {
    const validation = parseUniversalRepoUrl(value);
    if (!validation.isValid || !validation.info || validation.info.provider !== 'github') return null;
    return validation.info;
  };

  const loadBranches = async () => {
    const info = normalizeRepoInput(repoUrl);
    setBranchError(null);
    if (!info) {
      setBranchError('Enter a valid GitHub repository first.');
      return;
    }
    if (branchesFor === info.normalizedUrl + (githubToken ? ':token' : '')) return;
    setIsLoadingBranches(true);
    try {
      const result = await listRepositoryBranches(info.normalizedUrl, githubToken.trim() || undefined);
      setBranches(result.branches);
      setBranchesFor(info.normalizedUrl + (githubToken ? ':token' : ''));
      if (!branch && result.default_branch) setBranch(result.default_branch);
    } catch (err: any) {
      setBranches([]);
      setBranchError(err?.message || 'Could not load branches.');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const appendLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const executePipeline = async (
    repoName: string,
    analyze: () => Promise<ScanResult>
  ) => {
    setIsScanning(true);
    setFailedStep(null);
    setLogs([]);

    try {
      setActiveStepIndex(1);
      appendLog(`Submitting ${repoName} to the authenticated CodeSentry backend.`);
      appendLog('The backend retrieves files, runs static analysis, asks Gemini to explain the top findings, and scores risk. Large repositories can take a few minutes.');
      const scanResult = await analyze();
      setActiveStepIndex(4);
      if (scanResult.logs && scanResult.logs.length > 0) {
        setLogs(prev => [...prev, ...scanResult.logs!]);
      }
      for (const warning of scanResult.warnings || []) appendLog(`WARNING: ${warning}`);
      if (scanResult.ai_review?.status === 'available') {
        appendLog(`Gemini reviewed ${scanResult.ai_review.reviewed_finding_count ?? 0} finding(s) (AI suggestions, not verified fixes).`);
      } else if (scanResult.ai_review?.status === 'unavailable') {
        appendLog(`AI review unavailable: ${scanResult.ai_review.reason || 'unknown reason'}`);
      }
      appendLog(
        `Scan complete. Risk ${scanResult.risk_score}/100 (${scanResult.risk_label}). ` +
        `${scanResult.total_findings ?? scanResult.findings.length} finding(s); coverage ${scanResult.coverage?.coverage_status ?? 'unknown'}.`
      );
      onScanComplete(scanResult);
    } catch (err: any) {
      setFailedStep(1);
      appendLog(`ERROR: ${err?.message || 'Scan failed'}`);
      setUrlError(err?.message || 'Analysis failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    if (scanMode === 'paste') {
      if (!customCode.trim()) {
        setUrlError('Please paste source code to analyze.');
        return;
      }

      // Auto-detect language if filename extension doesn't match
      let detectedLang = 'Python';
      if (customCode.includes('public class') || customCode.includes('package com.') || customCode.includes('System.out.print')) detectedLang = 'Java';
      else if (customCode.includes('import React') || customCode.includes('interface ') || customCode.includes(': string') || customCode.includes(': number')) detectedLang = 'TypeScript';
      else if (customCode.includes('const ') || customCode.includes('let ') || customCode.includes('function ') || customCode.includes('console.log')) detectedLang = 'JavaScript';
      else if (customCode.includes('#include <') || customCode.includes('int main(')) detectedLang = 'C';
      else if (customCode.includes('package main') || customCode.includes('func main()') || customCode.includes('func ')) detectedLang = 'Go';
      else if (customCode.includes('<?php')) detectedLang = 'PHP';
      else if (customCode.includes('fn main()') || customCode.includes('pub fn ')) detectedLang = 'Rust';
      else if (customCode.includes('FROM ') && customCode.includes('RUN ')) detectedLang = 'Dockerfile';

      const extMap: Record<string, string> = {
        Python: '.py',
        TypeScript: '.ts',
        JavaScript: '.js',
        Java: '.java',
        C: '.c',
        Go: '.go',
        Rust: '.rs',
        PHP: '.php',
        Dockerfile: 'Dockerfile',
      };

      const finalExt = extMap[detectedLang] || '.py';
      const finalName = customFileName && customFileName !== 'app.py' && customFileName.includes('.')
        ? customFileName
        : `app${finalExt}`;

      if (!SUPPORTED_UPLOAD_PATTERN.test(finalName)) {
        setUrlError('Unsupported file type. Use a supported source extension such as .py, .js, .ts, .java, .go, .php, .rb, .c or .rs.');
        return;
      }
      const files: FileData[] = [{ path: finalName, content: customCode, language: detectedLang }];
      await executePipeline(
        `local-snippet/${finalName}`,
        () => analyzeFilesOnBackend(`local-snippet/${finalName}`, files)
      );
      return;
    }

    const validation = parseUniversalRepoUrl(repoUrl);
    if (!validation.isValid) {
      setUrlError(validation.error || 'Invalid repository identifier.');
      return;
    }
    const repositoryInfo = validation.info;
    if (!repositoryInfo || repositoryInfo.provider !== 'github') {
      setUrlError('CodeSentry currently supports GitHub repositories only.');
      return;
    }

    try {
      setLogs([`Connecting to ${repositoryInfo.normalizedUrl}...`]);
      await executePipeline(
        `${repositoryInfo.owner}/${repositoryInfo.repo}`,
        () => analyzeRepositoryOnBackend(
          repositoryInfo.normalizedUrl,
          branch.trim() || repositoryInfo.branch,
          showPrivate ? githubToken.trim() || undefined : undefined
        )
      );
    } catch (err: any) {
      setIsScanning(false);
      setUrlError(err?.message || 'Failed to fetch repository files.');
      appendLog(`Failed: ${err?.message}`);
    }
  };

  const handlePresetSelect = (preset: typeof POPULAR_PRESET_REPOS[0]) => {
    setScanMode('url');
    setUrlError(null);
    setRepoUrl(preset.url);
    setBranch(preset.branch);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const fileList = Array.from(uploadedFiles).filter(file =>
      SUPPORTED_UPLOAD_PATTERN.test(file.webkitRelativePath || file.name)
    );
    if (fileList.length === 0) {
      setUrlError('None of the selected files are supported. Upload source, configuration or dependency files (for example .py, .js, .ts, .java, .go, .php, requirements.txt, package-lock.json).');
      return;
    }
    if (fileList.length > 1000) {
      setUrlError('Upload no more than 1000 files in one analysis.');
      return;
    }
    const oversizedFile = fileList.find(file => file.size > 500_000);
    if (oversizedFile) {
      setUrlError(`${oversizedFile.name} exceeds the 500 KB per-file limit.`);
      return;
    }
    if (fileList.reduce((total, file) => total + file.size, 0) > 20_000_000) {
      setUrlError('The selected files exceed the 20 MB total upload limit.');
      return;
    }

    const readers: Promise<FileData>[] = fileList.map(f => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (typeof event.target?.result !== 'string') {
            reject(new Error(`Could not read ${f.name} as text.`));
            return;
          }
          resolve({ path: f.webkitRelativePath || f.name, content: event.target.result });
        };
        reader.onerror = () => reject(new Error(`Could not read ${f.name}.`));
        reader.readAsText(f);
      });
    });

    setUrlError(null);
    Promise.all(readers)
      .then(files => executePipeline(
        `local-upload/${files.length} file(s)`,
        () => analyzeFilesOnBackend(`local-upload/${files[0].path}`, files, 'local://uploaded-source', { includeAi: true })
      ))
      .catch(error => setUrlError(error.message || 'Could not read uploaded source files.'))
      .finally(() => {
        e.target.value = '';
      });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
          <Search className="w-5 h-5 text-cyan-400" />
          <span>Repository Security Scanner</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Server-side analysis of GitHub repositories and uploaded files: Python (AST, Pyflakes, Bandit), pattern rules for
          JavaScript/TypeScript, Java, Go, PHP, Ruby, C/C++, Rust and Shell, secret detection, configuration checks and
          dependency vulnerabilities (OSV.dev).
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => { setScanMode('url'); setUrlError(null); }}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            scanMode === 'url'
              ? 'bg-gradient-to-r from-blue-900/60 to-cyan-900/60 text-cyan-200 border border-cyan-800'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>GitHub Repository</span>
        </button>

        <button
          onClick={() => { setScanMode('paste'); setUrlError(null); }}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            scanMode === 'paste'
              ? 'bg-gradient-to-r from-blue-900/60 to-cyan-900/60 text-cyan-200 border border-cyan-800'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>Self Text / Code Snippet</span>
        </button>

        <label
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            scanMode === 'upload'
              ? 'bg-gradient-to-r from-blue-900/60 to-cyan-900/60 text-cyan-200 border border-cyan-800'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Code Files</span>
          <input
            type="file"
            multiple
            accept={SUPPORTED_UPLOAD_ACCEPT}
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Input Form Card */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        {scanMode === 'url' ? (
          <form onSubmit={handleStartScan} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  GitHub repository URL (e.g. <span className="font-mono text-cyan-400">https://github.com/psf/requests</span>)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setBranches([]);
                      setBranchesFor('');
                      setBranchError(null);
                      if (urlError) setUrlError(null);
                    }}
                    aria-label="GitHub repository URL"
                    placeholder="https://github.com/psf/requests or psf/requests"
                    disabled={isScanning}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-all"
                  />
                  <FolderGit2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="branch-input" className="text-xs font-medium text-slate-300">Branch (optional)</label>
                <div className="relative">
                  <input
                    id="branch-input"
                    type="text"
                    list="branch-options"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    onFocus={() => { if (repoUrl.trim() && branches.length === 0 && !isLoadingBranches) loadBranches(); }}
                    placeholder="Default branch"
                    disabled={isScanning}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-all"
                  />
                  <datalist id="branch-options">
                    {branches.map(name => <option key={name} value={name} />)}
                  </datalist>
                  <GitBranch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
                <button
                  type="button"
                  onClick={() => { setBranchesFor(''); loadBranches(); }}
                  disabled={isScanning || isLoadingBranches || !repoUrl.trim()}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 disabled:text-slate-600 cursor-pointer"
                >
                  {isLoadingBranches ? 'Loading branches…' : branches.length ? `${branches.length} branch(es) loaded — reload` : 'Load branches'}
                </button>
              </div>
            </div>

            {branchError && (
              <p className="text-[11px] text-amber-300" role="status">{branchError}</p>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrivate}
                  onChange={(e) => { setShowPrivate(e.target.checked); if (!e.target.checked) setGithubToken(''); }}
                  disabled={isScanning}
                />
                <span>This is a private repository</span>
              </label>
              {showPrivate && (
                <div className="space-y-1">
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="GitHub token with read access (github_pat_… or ghp_…)"
                    aria-label="GitHub personal access token"
                    disabled={isScanning}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Use a fine-grained token limited to this repository with read-only “Contents” and “Metadata” access.
                    It is sent over HTTPS for this scan only and is never saved, logged or shown again.
                  </p>
                </div>
              )}
            </div>

            {/* Popular Presets */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-slate-400 block font-medium">1-Click Featured Open-Source Presets:</span>
              <div className="flex flex-wrap gap-2">
                {POPULAR_PRESET_REPOS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-cyan-600 hover:text-cyan-300 font-mono transition-all cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {urlError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{urlError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Repository code is analyzed without executing it.</span>
              </div>

              <button
                type="submit"
                disabled={isScanning || !repoUrl.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Scanning Pipeline Active...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Scan Repository</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Quick Example Snippets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Load an example snippet:</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CODE_EXAMPLES.filter(ex => SUPPORTED_UPLOAD_PATTERN.test(ex.fileName)).map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => {
                      setCustomCode(ex.code);
                      setCustomFileName(ex.fileName);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-cyan-600 hover:text-cyan-300 font-mono transition-all cursor-pointer flex items-center space-x-1"
                  >
                    <span>{ex.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-300">File Name</label>
                <input
                  type="text"
                  value={customFileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  placeholder="app.py"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Source Code Text (Self Text / Code Snippet)</label>
              <textarea
                rows={9}
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder={`# Paste or write your own code text here...\ndef calculate(val, count):\n    return val / count\n`}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 leading-relaxed"
              />
            </div>

            {urlError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{urlError}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleStartScan}
                disabled={isScanning || !customCode.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Find Bugs & Scan Code</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Status Stages */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Analysis Pipeline Stages</span>
          <span className="text-xs text-slate-400">Pure Static Sandbox (Zero Execution)</span>
        </div>

        <div className="space-y-2">
          {steps.map((st) => (
            <div
              key={st.id}
              className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                st.status === 'completed'
                  ? 'bg-slate-950/60 border-emerald-900/50 text-slate-200'
                  : st.status === 'error'
                  ? 'bg-rose-950/30 border-rose-900 text-rose-200'
                  : st.status === 'active'
                  ? 'bg-blue-950/40 border-cyan-800 text-cyan-200 shadow-md shadow-cyan-950/30'
                  : 'bg-slate-950/30 border-slate-900 text-slate-600'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-mono text-[10px] text-slate-400">
                  {st.id}
                </span>
                <span>{st.label}</span>
              </div>
              <div>
                {st.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {st.status === 'active' && <RotateCw className="w-4 h-4 text-cyan-400 animate-spin" />}
                {st.status === 'pending' && <Lock className="w-3.5 h-3.5 text-slate-600" />}
                {st.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Terminal Live Output */}
      {logs.length > 0 && (
        <div className="p-4 rounded-2xl bg-black border border-slate-800 font-mono text-[11px] space-y-2 shadow-2xl">
          <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-slate-900">
            <div className="flex items-center space-x-2">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Console Stream</span>
            </div>
            <span>Static analysis · secrets · dependencies · AI review</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto text-slate-300">
            {logs.map((log, idx) => (
              <p key={idx} className="leading-relaxed">
                {log}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
