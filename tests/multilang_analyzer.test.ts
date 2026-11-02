/**
 * @file tests/multilang_analyzer.test.ts
 * Comprehensive unit test suite for CodeSentry AI multi-language file identification,
 * queueing, structured logging, and non-Python vulnerability detection.
 */

import { analyzeRepository, detectLanguage, FileData } from '../src/services/analyzerService';
import { isCodeFile, CODE_EXTENSIONS } from '../src/services/repoService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, details || '');
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string) {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  assert(match, testName, { expected, actual });
}

console.log('\n======================================================');
console.log('--- 1. Multi-Language File Identification Tests ---');
console.log('======================================================');

// Test 1.1: Extension-based identification across diverse languages
assertEqual(detectLanguage('main.py'), 'Python', 'Detects .py as Python');
assertEqual(detectLanguage('service.pyw'), 'Python', 'Detects .pyw as Python');
assertEqual(detectLanguage('types.pyi'), 'Python', 'Detects .pyi as Python');

assertEqual(detectLanguage('src/index.js'), 'JavaScript', 'Detects .js as JavaScript');
assertEqual(detectLanguage('components/App.jsx'), 'JavaScript', 'Detects .jsx as JavaScript');
assertEqual(detectLanguage('utils/helper.mjs'), 'JavaScript', 'Detects .mjs as JavaScript');
assertEqual(detectLanguage('lib/module.cjs'), 'JavaScript', 'Detects .cjs as JavaScript');

assertEqual(detectLanguage('src/App.tsx'), 'TypeScript', 'Detects .tsx as TypeScript');
assertEqual(detectLanguage('services/api.ts'), 'TypeScript', 'Detects .ts as TypeScript');
assertEqual(detectLanguage('cli/runner.mts'), 'TypeScript', 'Detects .mts as TypeScript');

assertEqual(detectLanguage('server/main.go'), 'Go', 'Detects .go as Go');
assertEqual(detectLanguage('go.mod'), 'Go', 'Detects go.mod as Go');

assertEqual(detectLanguage('src/lib.rs'), 'Rust', 'Detects .rs as Rust');
assertEqual(detectLanguage('Cargo.toml'), 'TOML', 'Detects Cargo.toml as TOML');

assertEqual(detectLanguage('com/example/App.java'), 'Java', 'Detects .java as Java');
assertEqual(detectLanguage('app/Main.kt'), 'Kotlin', 'Detects .kt as Kotlin');

assertEqual(detectLanguage('core/engine.c'), 'C', 'Detects .c as C');
assertEqual(detectLanguage('include/engine.h'), 'C', 'Detects .h as C');
assertEqual(detectLanguage('render/scene.cpp'), 'C++', 'Detects .cpp as C++');
assertEqual(detectLanguage('render/scene.hpp'), 'C++', 'Detects .hpp as C++');

assertEqual(detectLanguage('api/index.php'), 'PHP', 'Detects .php as PHP');
assertEqual(detectLanguage('views/template.phtml'), 'PHP', 'Detects .phtml as PHP');

assertEqual(detectLanguage('scripts/deploy.sh'), 'Shell', 'Detects .sh as Shell');
assertEqual(detectLanguage('scripts/setup.bash'), 'Shell', 'Detects .bash as Shell');

assertEqual(detectLanguage('db/schema.sql'), 'SQL', 'Detects .sql as SQL');
assertEqual(detectLanguage('Dockerfile'), 'Dockerfile', 'Detects Dockerfile as Dockerfile');
assertEqual(detectLanguage('Dockerfile.production'), 'Dockerfile', 'Detects Dockerfile.production as Dockerfile');
assertEqual(detectLanguage('Makefile'), 'Makefile', 'Detects Makefile as Makefile');

// Test 1.2: Content and shebang identification
assertEqual(
  detectLanguage('bin/tool', '#!/usr/bin/env node\nconsole.log("hello");'),
  'JavaScript',
  'Identifies extensionless file with node shebang as JavaScript'
);
assertEqual(
  detectLanguage('bin/exec', '#!/bin/bash\necho "running"'),
  'Shell',
  'Identifies extensionless file with bash shebang as Shell'
);
assertEqual(
  detectLanguage('bin/script', '#!/usr/bin/env python3\nprint("hi")'),
  'Python',
  'Identifies extensionless file with python shebang as Python'
);
assertEqual(
  detectLanguage('unknown_go', 'package main\nimport "fmt"\nfunc main() {}'),
  'Go',
  'Identifies Go content signature without extension'
);
assertEqual(
  detectLanguage('unknown_rust', 'use std::io;\nfn main() {\n    println!("hello");\n}'),
  'Rust',
  'Identifies Rust content signature without extension'
);

console.log('\n======================================================');
console.log('--- 2. Code File Queueing & Filter Verification ---');
console.log('======================================================');

assert(isCodeFile('app.py'), 'isCodeFile accepts .py');
assert(isCodeFile('server.js'), 'isCodeFile accepts .js');
assert(isCodeFile('component.tsx'), 'isCodeFile accepts .tsx');
assert(isCodeFile('main.go'), 'isCodeFile accepts .go');
assert(isCodeFile('lib.rs'), 'isCodeFile accepts .rs');
assert(isCodeFile('App.java'), 'isCodeFile accepts .java');
assert(isCodeFile('driver.c'), 'isCodeFile accepts .c');
assert(isCodeFile('driver.cpp'), 'isCodeFile accepts .cpp');
assert(isCodeFile('index.php'), 'isCodeFile accepts .php');
assert(isCodeFile('deploy.sh'), 'isCodeFile accepts .sh');
assert(isCodeFile('schema.sql'), 'isCodeFile accepts .sql');
assert(isCodeFile('Dockerfile'), 'isCodeFile accepts Dockerfile');
assert(isCodeFile('Makefile'), 'isCodeFile accepts Makefile');

assert(!isCodeFile('image.png'), 'isCodeFile rejects .png binary');
assert(!isCodeFile('archive.zip'), 'isCodeFile rejects .zip');
assert(!isCodeFile('binary.exe'), 'isCodeFile rejects .exe');
assert(!isCodeFile('cache.pyc'), 'isCodeFile rejects .pyc');
assert(!isCodeFile('font.woff2'), 'isCodeFile rejects .woff2');

console.log('\n======================================================');
console.log('--- 3. Non-Python Vulnerability Detection & Risk Calibration ---');
console.log('======================================================');

// Test 3.1: Go Command Injection and SQL Injection MUST NOT be marked safe
const goVulnFile: FileData[] = [
  {
    path: 'handlers/exec.go',
    content: `
package main
import (
    "fmt"
    "os/exec"
    "database/sql"
)
func handleRequest(userInput string, db *sql.DB) {
    // Vulnerability 1: Command Injection
    cmd := exec.Command("sh", "-c", userInput)
    cmd.Run()

    // Vulnerability 2: SQL Injection
    query := fmt.Sprintf("SELECT * FROM accounts WHERE id = '%s'", userInput)
    db.Query(query)
}
`
  }
];

const goScan = analyzeRepository('https://github.com/test/go-app', 'go-app', 'main', goVulnFile);
const goSecFindings = goScan.findings.filter(f => f.source === 'security');

assert(
  goSecFindings.some(f => f.rule_id === 'SEC-GO-EXEC' && f.severity === 'HIGH'),
  'Go Command Injection flagged as SEC-GO-EXEC (HIGH)'
);
assert(
  goSecFindings.some(f => f.rule_id === 'SEC-GO-SQLI' && f.severity === 'HIGH'),
  'Go SQL Injection flagged as SEC-GO-SQLI (HIGH)'
);
assert(
  goScan.risk_score >= 75,
  `Go vulnerable repository risk score elevated to HIGH RISK (actual: ${goScan.risk_score})`
);
assert(
  goScan.predictions[0]?.risk_label === 'HIGH',
  `Go file prediction is HIGH (actual: ${goScan.predictions[0]?.risk_label})`
);

// Test 3.2: Rust Command Injection & Transmutation MUST NOT be marked safe
const rustVulnFile: FileData[] = [
  {
    path: 'src/remote.rs',
    content: `
use std::process::Command;
use std::mem;

pub fn execute_shell(user_script: &str) {
    // Vulnerability 1: Command Injection
    let mut child = Command::new("sh").arg("-c").arg(user_script).spawn().unwrap();
    let _ = child.wait();
}

pub unsafe fn raw_cast(val: u64) -> *const u8 {
    // Vulnerability 2: Dangerous Type Transmutation
    mem::transmute(val)
}
`
  }
];

const rustScan = analyzeRepository('https://github.com/test/rust-app', 'rust-app', 'main', rustVulnFile);
const rustSecFindings = rustScan.findings.filter(f => f.source === 'security');

assert(
  rustSecFindings.some(f => f.rule_id === 'SEC-RUST-CMD' && f.severity === 'HIGH'),
  'Rust Command Injection flagged as SEC-RUST-CMD (HIGH)'
);
assert(
  rustSecFindings.some(f => f.rule_id === 'SEC-RUST-TRANSMUTE' && f.severity === 'HIGH'),
  'Rust Transmute flagged as SEC-RUST-TRANSMUTE (HIGH)'
);
assert(
  rustScan.risk_score >= 75,
  `Rust vulnerable repository risk score elevated to HIGH RISK (actual: ${rustScan.risk_score})`
);
assert(
  rustScan.predictions[0]?.risk_label === 'HIGH',
  `Rust file prediction is HIGH (actual: ${rustScan.predictions[0]?.risk_label})`
);

// Test 3.3: JavaScript Command Injection and XSS MUST NOT be marked safe
const jsVulnFile: FileData[] = [
  {
    path: 'routes/admin.js',
    content: `
const { exec } = require('child_process');

function renderProfile(req, res) {
  const userInput = req.query.name;
  
  // Vulnerability 1: Command Injection
  exec(\`whois \${userInput}\`);
  
  // Vulnerability 2: XSS
  document.getElementById('profile-name').innerHTML = userInput;
}
`
  }
];

const jsScan = analyzeRepository('https://github.com/test/js-app', 'js-app', 'main', jsVulnFile);
const jsSecFindings = jsScan.findings.filter(f => f.source === 'security');

assert(
  jsSecFindings.some(f => f.rule_id === 'SEC-JS-EXEC' && f.severity === 'HIGH'),
  'JavaScript Command Injection flagged as SEC-JS-EXEC (HIGH)'
);
assert(
  jsSecFindings.some(f => f.rule_id === 'SEC-JS-XSS' && f.severity === 'HIGH'),
  'JavaScript innerHTML XSS flagged as SEC-JS-XSS (HIGH)'
);
assert(
  jsScan.risk_score >= 75,
  `JavaScript vulnerable repository risk score elevated to HIGH RISK (actual: ${jsScan.risk_score})`
);
assert(
  jsScan.predictions[0]?.risk_label === 'HIGH',
  `JavaScript file prediction is HIGH (actual: ${jsScan.predictions[0]?.risk_label})`
);

// Test 3.4: Clean Non-Python Files MUST evaluate to 0 findings and LOW risk
const cleanPolyglotFiles: FileData[] = [
  {
    path: 'math.go',
    content: `
package math
func Add(a, b int) int {
    return a + b
}
`
  },
  {
    path: 'math.rs',
    content: `
pub fn multiply(a: i64, b: i64) -> i64 {
    a * b
}
`
  },
  {
    path: 'math.js',
    content: `
export function subtract(a, b) {
  return a - b;
}
`
  }
];

const cleanScan = analyzeRepository('https://github.com/test/clean-app', 'clean-app', 'main', cleanPolyglotFiles);
assertEqual(cleanScan.findings.length, 0, 'Clean polyglot repository has 0 findings');
assertEqual(cleanScan.risk_score, 0, 'Clean polyglot repository has risk_score 0');
assert(
  cleanScan.predictions.every(p => p.risk_label === 'LOW'),
  'All clean polyglot files predicted as LOW risk'
);

console.log('\n======================================================');
console.log('--- 4. Detailed Structured Logging Verification ---');
console.log('======================================================');

const multiRepo: FileData[] = [
  ...goVulnFile,
  ...rustVulnFile,
  ...jsVulnFile,
  {
    path: 'scripts/clean.py',
    content: 'def safe_fn():\n    return 42\n'
  }
];

const multiScan = analyzeRepository('https://github.com/test/multi-repo', 'multi-repo', 'main', multiRepo);

assert(Array.isArray(multiScan.logs) && multiScan.logs.length > 0, 'ScanResult includes structured logs array');

// Check that QUEUE stage logs include all files
const queueLogs = multiScan.logs!.filter(l => l.includes('[QUEUE]'));
assert(queueLogs.length >= 4, `QUEUE logs recorded for all files (count: ${queueLogs.length})`);
assert(
  queueLogs.some(l => l.includes("Queued non-Python/polyglot file 'handlers/exec.go' under [Go]")),
  'QUEUE log explicitly confirms Go file queueing'
);
assert(
  queueLogs.some(l => l.includes("Queued non-Python/polyglot file 'src/remote.rs' under [Rust]")),
  'QUEUE log explicitly confirms Rust file queueing'
);
assert(
  queueLogs.some(l => l.includes("Queued non-Python/polyglot file 'routes/admin.js' under [JavaScript]")),
  'QUEUE log explicitly confirms JavaScript file queueing'
);

// Check IDENTIFY stage logs
const identifyLogs = multiScan.logs!.filter(l => l.includes('[IDENTIFY]'));
assert(
  identifyLogs.some(l => l.includes("'handlers/exec.go' classified as 'Go'")),
  'IDENTIFY log classifies Go file'
);
assert(
  identifyLogs.some(l => l.includes("'src/remote.rs' classified as 'Rust'")),
  'IDENTIFY log classifies Rust file'
);

// Check ALERT stage logs
const alertLogs = multiScan.logs!.filter(l => l.includes('[ALERT]'));
assert(
  alertLogs.some(l => l.includes('CRITICAL SECURITY FLOOR ACTIVATED')),
  'ALERT log confirms Cybersecurity Floor Activation'
);

// Check RISK_SCORING stage logs
const riskLogs = multiScan.logs!.filter(l => l.includes('[RISK_SCORING]'));
assert(
  riskLogs.some(l => l.includes('Language distribution summary')),
  'RISK_SCORING log records language distribution summary'
);

// ==============================================================================
// 5. Self Text & Automated Error-Correction Engine Verification
// ==============================================================================
console.log('\n======================================================');
console.log('--- 5. Self Text & Automated Error-Correction Tests ---');
console.log('======================================================\n');

import { CODE_EXAMPLES, autoCorrectCodeSnippet } from '../src/services/remediationService.ts';

// Test 5.1: Python example bug finding and auto-correction
const pyExample = CODE_EXAMPLES.find(e => e.id === 'py-sqli-div')!;
const initialPyScan = analyzeRepository('local://test', 'test-py', 'main', [{ path: pyExample.fileName, content: pyExample.code }]);
assert(initialPyScan.findings.length >= 2, `Python example detects bugs/vulnerabilities (actual: ${initialPyScan.findings.length})`);
assert(initialPyScan.risk_score >= 75, `Python example risk score is high (actual: ${initialPyScan.risk_score})`);

// Auto-correct
const pyCorrection = autoCorrectCodeSnippet(pyExample.code, 'Python', initialPyScan.findings);
assert(pyCorrection.remediatedCount >= 2, `Python auto-correct remediated >= 2 issues (actual: ${pyCorrection.remediatedCount})`);
assert(pyCorrection.correctedCode.includes('query = "SELECT id, username, role FROM users WHERE username = ?"'), 'Python SQLi replaced with parameterized query');
assert(pyCorrection.correctedCode.includes('if total_tasks == 0:'), 'Python Zero Division guarded with defensive check');

// Re-scan corrected code
const fixedPyScan = analyzeRepository('local://test', 'test-py', 'main', [{ path: pyExample.fileName, content: pyCorrection.correctedCode }]);
assert(!fixedPyScan.findings.some(f => f.rule_id === 'B608'), 'Corrected Python code has 0 SQL injection findings');
assert(!fixedPyScan.findings.some(f => f.rule_id === 'BUG-DIV-001'), 'Corrected Python code has 0 Zero Division bugs');

// Test 5.2: JavaScript Command Injection and XSS auto-correction
const jsExample = CODE_EXAMPLES.find(e => e.id === 'js-xss-exec')!;
const initialJsScan = analyzeRepository('local://test', 'test-js', 'main', [{ path: jsExample.fileName, content: jsExample.code }]);
assert(initialJsScan.findings.some(f => f.rule_id === 'SEC-JS-EXEC'), 'JS example detects SEC-JS-EXEC');

const jsCorrection = autoCorrectCodeSnippet(jsExample.code, 'JavaScript', initialJsScan.findings);
assert(jsCorrection.correctedCode.includes('execFile'), 'JS Command Injection replaced with execFile');
assert(jsCorrection.correctedCode.includes('textContent'), 'JS XSS replaced with textContent');

// Test 5.3: Rust Command Injection & Unwrap auto-correction
const rustExample = CODE_EXAMPLES.find(e => e.id === 'rust-cmd-unwrap')!;
const initialRustScan = analyzeRepository('local://test', 'test-rust', 'main', [{ path: rustExample.fileName, content: rustExample.code }]);
assert(initialRustScan.findings.some(f => f.rule_id === 'SEC-RUST-CMD'), 'Rust example detects SEC-RUST-CMD');

const rustCorrection = autoCorrectCodeSnippet(rustExample.code, 'Rust', initialRustScan.findings);
assert(rustCorrection.correctedCode.includes('unwrap_or(8080)'), 'Rust unchecked unwrap corrected with defensive unwrap_or fallback');
assert(!rustCorrection.correctedCode.includes('.arg("-c")'), 'Rust shell wrapper removed');

console.log('\n======================================================');
console.log(`Unit Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
