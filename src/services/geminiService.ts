/**
 * @file src/services/geminiService.ts
 * Google Gemini integration for context-aware code remediation, secret redaction,
 * unified diff patch generation, and conversational chat assistant.
 */

import { AIReview, Finding, ScanResult } from '../types';
import { askBackendAssistant, generateBackendFindingReview } from './apiService';

/**
 * Redacts secrets, tokens, and passwords prior to sending code to LLM
 */
export function redactSecrets(code: string): string {
  let cleaned = code;
  // Mask common API keys, bearer tokens, JWTs
  cleaned = cleaned.replace(/(['"]?(?:api[_-]?key|secret|token|password|auth|passwd)['"]?\s*[:=]\s*['"])([^'"]{6,})(['"])/gi, '$1[REDACTED_SECRET]$3');
  // Mask AWS keys
  cleaned = cleaned.replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_AWS_KEY]');
  // Mask Private Keys
  cleaned = cleaned.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----[^-]+-----END (?:RSA )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  return cleaned;
}

/**
 * Validates Python syntax basic structural integrity
 */
export function verifyPythonSyntax(code: string): boolean {
  let parens = 0;
  let brackets = 0;
  let braces = 0;

  for (const char of code) {
    if (char === '(') parens++;
    else if (char === ')') parens--;
    else if (char === '[') brackets++;
    else if (char === ']') brackets--;
    else if (char === '{') braces++;
    else if (char === '}') braces--;

    if (parens < 0 || brackets < 0 || braces < 0) return false;
  }
  return parens === 0 && brackets === 0 && braces === 0;
}

/**
 * Generates unified diff string between original and corrected snippets
 */
export function generateUnifiedDiff(filePath: string, original: string, corrected: string, startLine = 1): string {
  const origLines = original.replace(/\n$/, '').split('\n');
  const corrLines = corrected.replace(/\n$/, '').split('\n');
  const start = Math.max(1, startLine);

  let patch = `--- a/${filePath}\n+++ b/${filePath}\n@@ -${start},${origLines.length} +${start},${corrLines.length} @@\n`;
  origLines.forEach(line => {
    patch += `-${line}\n`;
  });
  corrLines.forEach(line => {
    patch += `+${line}\n`;
  });
  return patch;
}

/**
 * Generates contextual remediation review for a flagged issue
 */
export async function generateAIReview(
  finding: Finding,
  fileContent: string
): Promise<AIReview> {
  // The backend stores redacted context lines around each finding; prefer them over the single flagged line.
  const snippet = finding.context || fileContent;
  return generateBackendFindingReview(finding, snippet.slice(0, 4000));
}

/**
 * Conversational Assistant response grounded in scan results
 */
export async function askAssistantQuestion(
  question: string,
  scan: ScanResult
): Promise<string> {
  const lowerQ = question.toLowerCase();

  // Fast computed answers directly from scan data
  if (lowerQ.includes('riskiest file') || lowerQ.includes('highest risk')) {
    if (!scan.predictions || scan.predictions.length === 0) {
      return "No file predictions are available for this scan yet.";
    }
    const highFiles = scan.predictions.filter(p => p.risk_label === 'HIGH' || p.risk_label === 'CRITICAL');
    if (highFiles.length > 0) {
      return `The highest rule-based risk estimates are:\n${highFiles.map(f => `- **${f.path}** (${f.risk_score}/100, ${f.risk_label})`).join('\n')}\n\nTop contributing factors: ${highFiles[0].top_features.join(', ')}.`;
    }
    return `All files analyzed have LOW or MEDIUM risk profiles. Top file with elevated complexity is **${scan.predictions[0]?.path}**.`;
  }

  if (lowerQ.includes('how many vulnerabilities') || lowerQ.includes('security issues')) {
    const secFindings = scan.findings?.filter(f => f.source === 'security' || f.source === 'dependency') || [];
    const count = (severity: string) => secFindings.filter(f => f.severity === severity).length;
    const categories = Object.entries(scan.category_counts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, total]) => `${name} (${total})`)
      .join(', ');
    return `CodeSentry AI reported **${secFindings.length} security/dependency findings** in this scan.\n` +
      `- Critical: ${count('CRITICAL')}, High: ${count('HIGH')}, Medium: ${count('MEDIUM')}, Low: ${count('LOW')}\n` +
      `- Most common categories: ${categories || 'none'}\n` +
      `- Coverage: ${scan.coverage?.coverage_status || 'unknown'} — findings only cover files that were actually scanned.`;
  }

  if (lowerQ.includes('explain quality') || lowerQ.includes('quality score')) {
    return `The repository quality score is **${scan.quality_score}/100**.\n` +
      `The backend subtracts severity-weighted findings per non-empty Python line from 100 and clamps the result at zero. ` +
      `Weights are Low 2, Medium 7, High 15, and Critical 25 points.`;
  }

  if (lowerQ.includes('ml prediction') || lowerQ.includes('random forest') || lowerQ.includes('model')) {
    return `This analysis uses a ${scan.risk_model || 'transparent rule-based baseline'}; no trained ML model is configured. ` +
      `The current risk score is ${scan.risk_score}/100. Contributing factors: ${(scan.risk_reasons || []).join('; ') || 'none reported'}.`;
  }

  const { answer, reason } = await askBackendAssistant(question, scan);
  if (answer) return answer;
  return `Gemini AI could not answer: ${reason || 'the AI assistant is unavailable.'}\n\n` +
    `Current scan: **${scan.repo_name}** has a risk score of **${scan.risk_score}/100**, a quality score of ` +
    `**${scan.quality_score}/100**, and **${scan.total_findings ?? scan.findings.length}** scanner finding(s).`;
}
