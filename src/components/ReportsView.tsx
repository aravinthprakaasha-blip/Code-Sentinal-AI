/**
 * @file src/components/ReportsView.tsx
 * Report generation view offering formatted Markdown and versioned JSON downloads.
 */

import React, { useState } from 'react';
import { FileText, Download, Copy, Check, Eye } from 'lucide-react';
import { ScanResult } from '../types';

interface ReportsViewProps {
  currentScan: ScanResult | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ currentScan }) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  if (!currentScan) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Scan to Export</h3>
        <p className="text-xs text-slate-500 mt-1">Scan a repository first to generate audit reports.</p>
      </div>
    );
  }

  const generateMarkdownReport = (): string => {
    const secFindings = currentScan.findings.filter(f => f.source === 'security' || f.source === 'dependency');
    const cov = currentScan.coverage;
    const bugFindings = currentScan.findings.filter(f => f.source === 'bug');
    const qualFindings = currentScan.findings.filter(f => f.source === 'quality');

    return `# CodeSentry AI Security & Quality Audit Report
**Target Repository:** ${currentScan.repo_name}  
**Repository URL:** ${currentScan.repo_url}  
**Branch:** ${currentScan.branch}  
**Commit SHA:** ${currentScan.commit_sha}  
**Scan Timestamp (UTC):** ${currentScan.timestamp}  
**Scan Duration:** ${currentScan.duration_seconds.toFixed(2)} seconds  

---

## Executive Summary
- **Overall Risk Score:** **${currentScan.risk_score} / 100** (${currentScan.risk_label || (currentScan.risk_score >= 80 ? 'CRITICAL' : currentScan.risk_score >= 60 ? 'HIGH' : currentScan.risk_score >= 30 ? 'MEDIUM' : 'LOW')})
- **Code Quality Score:** **${currentScan.quality_score} / 100**
- **Security Status:** ${currentScan.security_status?.label || 'n/a'} — ${currentScan.security_status?.message || ''}
- **Repository Files:** ${cov?.repository_files ?? currentScan.repository_file_count ?? currentScan.files.length}
- **Files Scanned:** ${cov?.files_scanned ?? currentScan.files.length} (skipped: ${cov?.files_skipped ?? 0}; coverage: ${cov ? `${cov.coverage_status}, ${Math.round(cov.coverage_ratio * 100)}%` : 'unknown'})
- **Unsupported languages:** ${cov && Object.keys(cov.unsupported_languages).length ? Object.entries(cov.unsupported_languages).map(([l, c]) => `${l} (${c})`).join(', ') : 'none'}
- **Analysis failures:** ${cov?.analysis_failures.length ? cov.analysis_failures.map(f => `${f.path}: ${f.reason}`).join('; ') : 'none'}
- **Dependency check:** ${cov?.dependency_scan.status ?? 'n/a'}
- **Analyzed Languages:** ${Object.entries(currentScan.languages_detected || {}).map(([l, s]) => `${l} (${s.percentage}%)`).join(', ') || 'None'}
- **Total Findings Detected:** ${currentScan.total_findings ?? currentScan.findings.length}
  - Findings included in this report: ${currentScan.findings.length}${currentScan.findings_truncated ? ' (highest severity first; remaining finding details omitted to keep the report within storage limits)' : ''}
  - Security findings (Bandit, rules, secrets): ${currentScan.source_counts?.security ?? 0}
  - Vulnerable dependencies: ${currentScan.source_counts?.dependency ?? 0}
  - Bug findings: ${currentScan.source_counts?.bug ?? bugFindings.length}
  - Code Quality Deficits: ${currentScan.source_counts?.quality ?? qualFindings.length}

---

## Rule-Based Risk Factors
- **Security findings:** ${currentScan.risk_breakdown?.security || 0} / 100
- **Bug findings:** ${currentScan.risk_breakdown?.bugs || 0} / 100
- **Cyclomatic complexity and nested loops:** ${currentScan.risk_breakdown?.complexity || 0} / 100
- **Quality deficits:** ${currentScan.risk_breakdown?.quality || 0} / 100
- **Risk rationale:** ${(currentScan.risk_reasons || []).join('; ') || 'No risk reasons were reported.'}
- **How the score is calculated:** ${currentScan.risk_explanation || 'transparent rule-based model'}

---

## Security Vulnerabilities
${secFindings.length === 0 ? '_No security vulnerabilities detected._' : secFindings.map(f => `
### [${f.severity}] ${f.rule_id} - ${f.title}
- **Category:** ${f.category || 'n/a'} (detected by ${f.analyzer || 'scanner'}${f.is_heuristic ? ', heuristic — verify manually' : ''})
- **Location:** \`${f.file_path}:${f.line_start}\`
- **CWE:** ${f.cwe || 'N/A'}
- **Confidence:** ${f.confidence}
- **Description:** ${f.description}
- **Remediation:** ${f.suggested_fix}
`).join('\n')}

---

## AST Bug Candidates
${bugFindings.length === 0 ? '_No AST bug candidates detected._' : bugFindings.map(f => `
### [${f.severity}] ${f.rule_id} - ${f.title}
- **Location:** \`${f.file_path}:${f.line_start}\`
- **Candidate Heuristic:** ${f.is_heuristic ? 'Yes' : 'No'}
- **Description:** ${f.description}
- **Suggested Fix:** ${f.suggested_fix}
`).join('\n')}

---

## Rule-Based Per-File Risk Estimates
| File Path | Risk Score | Risk Tier | Contributing Factors |
| :--- | ---: | :--- | :--- |
${currentScan.predictions.map(p => `| \`${p.path}\` | ${p.risk_score}/100 | **${p.risk_label}** | ${p.top_features.join(', ')} |`).join('\n')}

---

## Gemini AI Recommendations (AI-generated suggestions, not verified fixes)
${currentScan.ai_review?.status === 'available' ? [
  currentScan.ai_review.repository_review || '',
  ...(currentScan.ai_review.recommendations || []).map(item =>
    `- **${item.rule_id}:** ${item.explanation}\n  - Suggested code: \`${item.suggested_code.replace(/`/g, '\\`')}\`\n  - Best practice: ${item.best_practice}`
  ),
].filter(Boolean).join('\n\n') || '_Gemini returned no recommendations._' : `AI review unavailable${currentScan.ai_review?.reason ? `: ${currentScan.ai_review.reason}` : ' (not requested or not configured).'}`}

---

## Disclaimer & Limitations
This report contains Python AST/Pyflakes/Bandit results, heuristic multi-language security rules, secret detection, OSV.dev dependency results (when available) and a transparent rule-based risk score covering only the files that were scanned. No findings does not mean the code is secure. No trained ML model is used. Static-analysis findings may require human validation and do not represent a formal penetration test. Review and test AI-generated recommendations before applying them.
`;
  };

  const handleDownloadMarkdown = () => {
    const md = generateMarkdownReport();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codesentry-audit-${currentScan.repo_name.replace(/[/\\.]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const jsonPayload = {
      schema_version: '1.0.0',
      generator: 'CodeSentry AI',
      generated_at: new Date().toISOString(),
      scan: currentScan,
    };
    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codesentry-audit-${currentScan.repo_name.replace(/[/\\.]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <span>Audit Reports & Data Export</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Export comprehensive, escaped Markdown audit reports or versioned JSON schemas for CI/CD pipelines.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleDownloadMarkdown}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Markdown</span>
          </button>
          <button
            onClick={handleDownloadJson}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {/* Markdown Preview Card */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span>Report Preview</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(generateMarkdownReport());
              setCopiedMd(true);
              setTimeout(() => setCopiedMd(false), 2000);
            }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
          >
            {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMd ? 'Copied' : 'Copy Text'}</span>
          </button>
        </div>

        <div className="p-6 font-mono text-xs text-slate-300 bg-slate-950/80 max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {generateMarkdownReport()}
        </div>
      </div>
    </div>
  );
};
