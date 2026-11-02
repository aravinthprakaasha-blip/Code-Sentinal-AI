/**
 * @file src/components/ScannerView.tsx
 * Universal repository scanner interface supporting all Git URLs, deep tree links,
 * preset open-source repositories, and direct Python code/file ingestion.
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
  fetchUniversalRepositoryFiles,
  parseUniversalRepoUrl,
  POPULAR_PRESET_REPOS,
  SAMPLE_VULNERABLE_REPO,
  isCodeFile,
} from '../services/repoService';
import { analyzeRepository, FileData } from '../services/analyzerService';
import { CODE_EXAMPLES } from '../services/remediationService';
import { ScanResult } from '../types';

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
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const steps: ScanStep[] = [
    { id: 1, label: 'Resolve Repository Target & Enforce Path Traversal Hygiene', status: activeStepIndex > 0 ? 'completed' : activeStepIndex === 0 && isScanning ? 'active' : 'pending' },
    { id: 2, label: 'Ingest Repository & Extract Polyglot Source (Python, Go, Rust, JS/TS, Java, C/C++)', status: activeStepIndex > 1 ? 'completed' : activeStepIndex === 1 && isScanning ? 'active' : 'pending' },
    { id: 3, label: 'Run AST & Static Bug Detectors Across Polyglot Engines', status: activeStepIndex > 2 ? 'completed' : activeStepIndex === 2 && isScanning ? 'active' : 'pending' },
    { id: 4, label: 'Run Security Scanners & Map MITRE CWEs (Bandit, GoSec, RustSec, ESLint-Sec)', status: activeStepIndex > 3 ? 'completed' : activeStepIndex === 3 && isScanning ? 'active' : 'pending' },
    { id: 5, label: 'Run Code Quality & Cyclomatic Complexity Analysis', status: activeStepIndex > 4 ? 'completed' : activeStepIndex === 4 && isScanning ? 'active' : 'pending' },
    { id: 6, label: 'Evaluate ML Risk Engine & Enforce Cybersecurity Threat Floors', status: activeStepIndex > 5 ? 'completed' : activeStepIndex === 5 && isScanning ? 'active' : 'pending' },
    { id: 7, label: 'Compute Composite Risk Index & Sync to Cloud Firestore', status: activeStepIndex > 6 ? 'completed' : activeStepIndex === 6 && isScanning ? 'active' : 'pending' },
  ];

  const appendLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const executePipeline = async (
    url: string,
    br: string,
    filesData: FileData[],
    repoName: string
  ) => {
    setIsScanning(true);
    setLogs([]);

    try {
      // Step 1
      setActiveStepIndex(0);
      appendLog(`Target confirmed: ${repoName} (${url})`);
      await new Promise(r => setTimeout(r, 200));

      // Step 2
      setActiveStepIndex(1);
      appendLog(`Ingested ${filesData.length} source file(s) across polyglot languages into isolated memory sandbox.`);
      await new Promise(r => setTimeout(r, 200));

      // Step 3
      setActiveStepIndex(2);
      appendLog(`Running bug detector across ${filesData.length} files (AST zero-div, loop bounds, error unwraps)...`);
      await new Promise(r => setTimeout(r, 200));

      // Step 4
      setActiveStepIndex(3);
      appendLog('Security engines checking SQL injection, shell exec, unsafe blocks, memory transmutations, and secrets...');
      await new Promise(r => setTimeout(r, 200));

      // Step 5
      setActiveStepIndex(4);
      appendLog('Computing code quality metrics, nesting depth, and cyclomatic complexity...');
      await new Promise(r => setTimeout(r, 200));

      // Step 6
      setActiveStepIndex(5);
      appendLog('Evaluating ML Risk Classifier & Cybersecurity Floor Guards across polyglot files...');
      await new Promise(r => setTimeout(r, 200));

      // Step 7
      setActiveStepIndex(6);
      appendLog('Synthesizing composite repository risk index (0-100)...');
      const scanResult = analyzeRepository(url, repoName, br || 'main', filesData);

      // Append backend execution logs directly into UI terminal for complete visibility
      if (scanResult.logs && scanResult.logs.length > 0) {
        setLogs(prev => [...prev, ...scanResult.logs!]);
      }

      await new Promise(r => setTimeout(r, 200));

      appendLog(`Scan complete! Risk Index: ${scanResult.risk_score}/100. Issues detected: ${scanResult.findings.length}.`);
      setActiveStepIndex(7);
      onScanComplete(scanResult);
    } catch (err: any) {
      appendLog(`ERROR: ${err?.message || 'Scan failed'}`);
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

      const files: FileData[] = [{ path: finalName, content: customCode, language: detectedLang }];
      await executePipeline('local://pasted-snippet', 'main', files, `local-snippet/${finalName}`);
      return;
    }

    const validation = parseUniversalRepoUrl(repoUrl);
    if (!validation.isValid) {
      setUrlError(validation.error || 'Invalid repository identifier.');
      return;
    }

    try {
      setIsScanning(true);
      setLogs([`Connecting to ${validation.info?.normalizedUrl}...`]);

      const result = await fetchUniversalRepositoryFiles(
        repoUrl,
        branch || undefined,
        250,
        (statusMsg) => appendLog(statusMsg)
      );

      await executePipeline(result.repoUrl, result.actualBranch, result.files, result.repoName);
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

    // Accept all recognized programming code files
    const fileList = Array.from(uploadedFiles).filter(f => isCodeFile(f.name));
    if (fileList.length === 0) {
      setUrlError('Please upload code files (e.g. .py, .js, .ts, .java, .c, .go, .php, .sql, etc.).');
      return;
    }

    const readers: Promise<FileData>[] = fileList.map(f => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({
            path: f.name,
            content: (event.target?.result as string) || '',
          });
        };
        reader.readAsText(f);
      });
    });

    Promise.all(readers).then(files => {
      executePipeline('local://uploaded-files', 'local', files, `local-upload/${files[0].path}`);
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
          <Search className="w-5 h-5 text-cyan-400" />
          <span>Universal Repository Scanner</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Supports all GitHub, GitLab, and Bitbucket URLs, branch deep-links, slugs (<code className="text-cyan-300">owner/repo</code>), and direct code uploads.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => { setScanMode('url'); setUrlError(null); }}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            scanMode === 'url'
              ? 'bg-gradient-to-r from-blue-900/60 to-cyan-900/60 text-cyan-200 border border-cyan-800'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Repository Link / Git Slug</span>
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
            accept=".py,.js,.ts,.go,.rs,.java,.c,.cpp,.php"
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
                  Repository URL or Slug (e.g. <span className="font-mono text-cyan-400">psf/requests</span>, <span className="font-mono text-cyan-400">pallets/flask</span>, or full HTTPS link)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      if (urlError) setUrlError(null);
                    }}
                    placeholder="https://github.com/psf/requests or psf/requests"
                    disabled={isScanning}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-all"
                  />
                  <FolderGit2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Branch (optional)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="Auto-detect"
                    disabled={isScanning}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-all"
                  />
                  <GitBranch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>
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
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{urlError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Zero rate limits via global repository mirrors.</span>
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
                  <span>Load Buggy Example Snippet with 1-Click:</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CODE_EXAMPLES.map((ex) => (
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
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
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
            <span>Python AST / Bandit / Pylint / Scikit-Learn</span>
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
