/**
 * @file src/services/repoService.ts
 * Universal repository ingestion supporting all GitHub URL formats, deep tree links,
 * branch auto-detection, zero-rate-limit fallback CDNs, and GitLab/Bitbucket repositories.
 */

import { FileData } from './analyzerService';

export interface ParsedRepoInfo {
  provider: 'github' | 'gitlab' | 'bitbucket' | 'direct';
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
  normalizedUrl: string;
}

/**
 * Universal Repository URL Parser & Normalizer
 * Accepts:
 * - https://github.com/owner/repo
 * - http://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo (e.g., pallets/flask, psf/requests)
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo/tree/branch_name
 * - https://github.com/owner/repo/tree/branch_name/sub/folder
 * - https://github.com/owner/repo/blob/branch/path/file.py
 * - https://gitlab.com/owner/repo
 * - https://bitbucket.org/owner/repo
 */
export function parseUniversalRepoUrl(input: string): { isValid: boolean; info?: ParsedRepoInfo; error?: string } {
  if (!input || typeof input !== 'string') {
    return { isValid: false, error: 'Repository URL or identifier is required.' };
  }

  let clean = input.trim();

  // Guard against shell metacharacters and local file schemes
  if (clean.includes(';') || clean.includes('|') || clean.includes('&') || clean.startsWith('file://')) {
    return { isValid: false, error: 'URL contains prohibited characters or illegal protocols.' };
  }

  // Auto-prepend https:// if missing
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    // If format is owner/repo without host
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(clean)) {
      clean = `https://github.com/${clean}`;
    } else if (clean.startsWith('github.com/') || clean.startsWith('gitlab.com/') || clean.startsWith('bitbucket.org/')) {
      clean = `https://${clean}`;
    } else {
      clean = `https://${clean}`;
    }
  }

  try {
    const urlObj = new URL(clean);
    const host = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.replace(/^\/+|\/+$/g, '');
    const parts = pathname.split('/');

    if (parts.length < 2) {
      return { isValid: false, error: 'Invalid repository path. Expected at least owner/repository name.' };
    }

    const owner = parts[0];
    const rawRepo = parts[1].replace(/\.git$/i, '');

    // Prevent path traversal sequences
    if (owner.includes('..') || rawRepo.includes('..')) {
      return { isValid: false, error: 'Path traversal sequences are strictly forbidden.' };
    }

    // GitHub Handling
    if (host === 'github.com' || host === 'www.github.com') {
      let branch: string | undefined = undefined;
      let subpath: string | undefined = undefined;

      // Check if URL points to a tree or blob: /owner/repo/tree/branch/... or /owner/repo/blob/branch/...
      if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob')) {
        branch = parts[3];
        if (parts.length > 4) {
          subpath = parts.slice(4).join('/');
        }
      }

      return {
        isValid: true,
        info: {
          provider: 'github',
          owner,
          repo: rawRepo,
          branch,
          subpath,
          normalizedUrl: `https://github.com/${owner}/${rawRepo}`,
        },
      };
    }

    // GitLab Handling
    if (host === 'gitlab.com' || host === 'www.gitlab.com') {
      let branch: string | undefined = undefined;
      if (parts.length >= 4 && (parts[2] === '-' && parts[3] === 'tree')) {
        branch = parts[4];
      }

      return {
        isValid: true,
        info: {
          provider: 'gitlab',
          owner,
          repo: rawRepo,
          branch,
          normalizedUrl: `https://gitlab.com/${owner}/${rawRepo}`,
        },
      };
    }

    // Bitbucket Handling
    if (host === 'bitbucket.org' || host === 'www.bitbucket.org') {
      return {
        isValid: true,
        info: {
          provider: 'bitbucket',
          owner,
          repo: rawRepo,
          normalizedUrl: `https://bitbucket.org/${owner}/${rawRepo}`,
        },
      };
    }

    // Generic git host
    return {
      isValid: true,
      info: {
        provider: 'github',
        owner,
        repo: rawRepo,
        normalizedUrl: `https://${host}/${owner}/${rawRepo}`,
      },
    };
  } catch {
    return { isValid: false, error: 'Could not parse repository URL. Please enter a valid URL.' };
  }
}

/**
 * Backward compatibility helper for existing callers
 */
export function validateGitHubUrl(url: string) {
  const result = parseUniversalRepoUrl(url);
  if (!result.isValid) {
    return { isValid: false, error: result.error };
  }
  return {
    isValid: true,
    owner: result.info?.owner,
    repo: result.info?.repo,
    branch: result.info?.branch,
  };
}

/**
 * Popular Featured Open-Source Repositories for 1-Click Scan
 */
export const POPULAR_PRESET_REPOS = [
  {
    name: 'psf/requests',
    url: 'https://github.com/psf/requests',
    branch: 'main',
    description: 'Python HTTP library for humans (used by millions).',
  },
  {
    name: 'pallets/flask',
    url: 'https://github.com/pallets/flask',
    branch: 'main',
    description: 'The Python micro framework for building web applications.',
  },
  {
    name: 'tiangolo/fastapi',
    url: 'https://github.com/tiangolo/fastapi',
    branch: 'master',
    description: 'Modern, fast web framework for building APIs with Python 3.8+.',
  },
  {
    name: 'bottlepy/bottle',
    url: 'https://github.com/bottlepy/bottle',
    branch: 'master',
    description: 'Fast and simple WSGI micro web framework.',
  },
  {
    name: 'CodeSentry-AI/vulnerable-python-sample',
    url: 'https://github.com/CodeSentry-AI/vulnerable-python-sample',
    branch: 'main',
    description: 'Intentionally vulnerable security benchmark (SQLi, command injection, div0).',
  },
];

// Supported code and programming file extensions across all languages
export const CODE_EXTENSIONS = [
  '.py', '.pyw', '.pyi',
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.cs', '.go', '.rs', '.php', '.phtml', '.php7', '.php8', '.rb',
  '.sh', '.bash', '.zsh', '.sql',
  '.swift', '.scala', '.lua', '.r', '.dart',
  '.yaml', '.yml', '.json', '.toml',
];

export function isCodeFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const base = lower.split('/').pop() || '';
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return true;
  if (base === 'makefile' || base.endsWith('.mk') || base === 'gnumakefile') return true;
  if (base === 'jenkinsfile' || base === 'gemfile') return true;
  if (base === 'cargo.toml' || base === 'cargo.lock') return true;
  if (base === 'go.mod' || base === 'go.sum') return true;
  return CODE_EXTENSIONS.some(ext => lower.endsWith(ext));
}
export const SAMPLE_VULNERABLE_REPO = {
  name: 'CodeSentry-AI/polyglot-security-benchmark',
  url: 'https://github.com/CodeSentry-AI/polyglot-security-benchmark',
  branch: 'main',
  description: 'Realistic multi-language benchmark containing Python, TypeScript, Java, C, Go, and Dockerfile security vulnerabilities.',
  files: [
    {
      path: 'auth/user_service.py',
      language: 'Python',
      content: `"""User authentication and credential verification service."""
import os
import hashlib
import sqlite3

# Hardcoded secret candidate
JWT_SECRET_KEY = "s3cr3t_p@ssw0rd_t0k3n_12345!"
DATABASE_PATH = "/tmp/users.db"

def verify_credentials(username, password):
    # Insecure MD5 hash calculation
    hashed_pwd = hashlib.md5(password.encode()).hexdigest()
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Vulnerable SQL Injection query via string formatting
    query = f"SELECT id, role FROM users WHERE username = '{username}' AND password = '{hashed_pwd}'"
    cursor.execute(query)
    
    user = cursor.fetchone()
    conn.close()
    return user

def process_token(token, options={}):
    # Mutable default argument candidate
    if token is "admin_token":
        return {"authorized": True}
    return None
`,
    },
    {
      path: 'frontend/src/authService.ts',
      language: 'TypeScript',
      content: `// TypeScript authentication and DOM rendering service
export interface UserSession {
  token: string;
  role: string;
}

const HARDCODED_API_KEY = "AIzaSyC_DEMO_CLIENT_KEY_987654321";

export function renderUserBadge(container: HTMLElement, rawUsername: string): void {
  // Cross-Site Scripting (XSS) via unescaped innerHTML
  container.innerHTML = "<div class='badge'>Welcome, " + rawUsername + "</div>";
}

export function evaluateExpression(expr: string): any {
  // Dangerous code execution via eval
  return eval(expr);
}

export function checkPermission(user: any): boolean {
  // Loose equality bug
  if (user.role == 0) {
    return false;
  }
  return true;
}
`,
    },
    {
      path: 'services/PaymentProcessor.java',
      language: 'Java',
      content: `package com.codesentry.payment;

import java.io.*;
import java.sql.*;

public class PaymentProcessor {
    private String dbUrl = "jdbc:mysql://localhost:3306/payments";

    public Object restoreSession(byte[] serializedData) throws Exception {
        // Insecure ObjectInputStream deserialization (CWE-502)
        ByteArrayInputStream bais = new ByteArrayInputStream(serializedData);
        ObjectInputStream ois = new ObjectInputStream(bais);
        return ois.readObject();
    }

    public ResultSet findInvoice(Connection conn, String invoiceId) throws SQLException {
        Statement stmt = conn.createStatement();
        // SQL Injection via string concatenation (CWE-89)
        String sql = "SELECT * FROM invoices WHERE id = '" + invoiceId + "'";
        return stmt.executeQuery(sql);
    }

    public void processTransaction() {
        try {
            int result = 100 / 0; // Division by zero candidate
        } catch (Exception e) {
            // Suppressed generic exception handler
        }
    }
}
`,
    },
    {
      path: 'native/packet_parser.c',
      language: 'C',
      content: `#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void parse_packet(char *user_input) {
    char local_buffer[64];
    
    // Insecure gets() call with zero buffer bounds check
    gets(local_buffer);
    
    // Buffer overflow via unbounded strcpy
    strcpy(local_buffer, user_input);
    
    // Command injection via system()
    char cmd[128];
    sprintf(cmd, "echo packet: %s", user_input);
    system(cmd);
}
`,
    },
    {
      path: 'backend/worker.go',
      language: 'Go',
      content: `package main

import (
    "fmt"
    "os/exec"
)

func ExecuteTask(taskCommand string) error {
    // Command Injection in Go Subprocess
    cmd := exec.Command("sh", "-c", taskCommand)
    out, err := cmd.CombinedOutput()
    if err != nil {
        return err
    }
    fmt.Printf("Task Output: %s\\n", out)
    return nil
}
`,
    },
    {
      path: 'deploy/Dockerfile',
      language: 'Dockerfile',
      content: `FROM ubuntu:latest

# Sensitive credentials embedded in Dockerfile ENV
ENV DB_PASSWORD=SuperSecretRootPassword123!
ENV AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE99

RUN apt-get update && apt-get install -y python3 curl

CMD ["python3", "app.py"]
`,
    },
  ],
};

/**
 * Universal repository file fetcher with auto-branch discovery and multi-tier fallbacks
 */
export async function fetchUniversalRepositoryFiles(
  repoInput: string,
  userSpecifiedBranch?: string,
  maxFileSizeKb: number = 250,
  onProgress?: (msg: string) => void
): Promise<{ files: FileData[]; actualBranch: string; repoName: string; repoUrl: string }> {
  const parsed = parseUniversalRepoUrl(repoInput);
  if (!parsed.isValid || !parsed.info) {
    throw new Error(parsed.error || 'Invalid repository identifier.');
  }

  const { owner, repo, provider, normalizedUrl } = parsed.info;
  const repoName = `${owner}/${repo}`;
  const candidateBranches = [
    userSpecifiedBranch,
    parsed.info.branch,
    'main',
    'master',
    'dev',
    'trunk',
    'release',
  ].filter(Boolean) as string[];

  // Remove duplicates while preserving order
  const uniqueBranches = Array.from(new Set(candidateBranches));

  // If this matches the sample repo name, return instantly
  if (repoName.toLowerCase().includes('vulnerable-python-sample')) {
    return {
      files: SAMPLE_VULNERABLE_REPO.files,
      actualBranch: 'main',
      repoName: SAMPLE_VULNERABLE_REPO.name,
      repoUrl: SAMPLE_VULNERABLE_REPO.url,
    };
  }

  onProgress?.(`Resolving repository metadata for ${repoName}...`);

  // =========================================================================
  // Strategy 1: GitHub Official Git Trees API
  // =========================================================================
  if (provider === 'github') {
    let rateLimited = false;

    for (const testBranch of uniqueBranches) {
      try {
        onProgress?.(`Querying GitHub API (branch: '${testBranch}')...`);
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${testBranch}?recursive=1`;
        const treeRes = await fetch(treeUrl, {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });

        if (treeRes.status === 403 || treeRes.status === 429) {
          rateLimited = true;
          onProgress?.('GitHub API rate limit reached. Switching to global high-speed mirror...');
          break; // Fall through to jsDelivr / raw mirror
        }

        if (treeRes.status === 404) {
          // Branch not found, try next candidate branch
          continue;
        }

        if (treeRes.ok) {
          const treeData = await treeRes.json();
          if (treeData.tree && Array.isArray(treeData.tree)) {
            const codeFiles = treeData.tree.filter(
              (item: any) =>
                item.type === 'blob' &&
                isCodeFile(item.path) &&
                !item.path.includes('venv/') &&
                !item.path.includes('.venv/') &&
                !item.path.includes('node_modules/') &&
                !item.path.includes('__pycache__/') &&
                !item.path.includes('dist/') &&
                !item.path.includes('build/') &&
                (!item.size || item.size <= maxFileSizeKb * 1024)
            );

            if (codeFiles.length > 0) {
              onProgress?.(`Discovered ${codeFiles.length} source code files on branch '${testBranch}'. Ingesting...`);
              const selected = codeFiles.slice(0, 25);
              const files: FileData[] = [];

              await Promise.all(
                selected.map(async (fileMeta: any) => {
                  try {
                    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${testBranch}/${fileMeta.path}`;
                    const rawRes = await fetch(rawUrl);
                    if (rawRes.ok) {
                      const content = await rawRes.text();
                      files.push({ path: fileMeta.path, content });
                    }
                  } catch {
                    // Ignore single file fetch error
                  }
                })
              );

              if (files.length > 0) {
                return {
                  files,
                  actualBranch: testBranch,
                  repoName,
                  repoUrl: normalizedUrl,
                };
              }
            }
          }
        }
      } catch {
        // Try next branch or strategy
      }
    }

    // =========================================================================
    // Strategy 2: High-Speed Zero-Rate-Limit Mirror (jsDelivr GitHub Package API)
    // =========================================================================
    onProgress?.('Accessing repository via CDN mirror...');
    for (const testBranch of uniqueBranches) {
      try {
        const cdnTreeUrl = `https://data.jsdelivr.com/v1/package/gh/${owner}/${repo}@${testBranch}/flat`;
        const cdnRes = await fetch(cdnTreeUrl);
        if (cdnRes.ok) {
          const cdnData = await cdnRes.json();
          if (cdnData.files && Array.isArray(cdnData.files)) {
            const codeFiles = cdnData.files.filter(
              (f: any) =>
                isCodeFile(f.name) &&
                !f.name.includes('/venv/') &&
                !f.name.includes('/.venv/') &&
                !f.name.includes('/node_modules/') &&
                !f.name.includes('/__pycache__/') &&
                !f.name.includes('/dist/') &&
                (!f.size || f.size <= maxFileSizeKb * 1024)
            );

            if (codeFiles.length > 0) {
              onProgress?.(`Found ${codeFiles.length} source code files on '${testBranch}' via CDN mirror. Downloading...`);
              const selected = codeFiles.slice(0, 25);
              const files: FileData[] = [];

              await Promise.all(
                selected.map(async (f: any) => {
                  try {
                    const cleanPath = f.name.replace(/^\//, '');
                    const rawUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${testBranch}/${cleanPath}`;
                    const rawRes = await fetch(rawUrl);
                    if (rawRes.ok) {
                      const content = await rawRes.text();
                      files.push({ path: cleanPath, content });
                    }
                  } catch {
                    // Skip
                  }
                })
              );

              if (files.length > 0) {
                return {
                  files,
                  actualBranch: testBranch,
                  repoName,
                  repoUrl: normalizedUrl,
                };
              }
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // =========================================================================
  // Strategy 3: GitLab API
  // =========================================================================
  if (provider === 'gitlab') {
    const encodedProj = encodeURIComponent(`${owner}/${repo}`);
    for (const testBranch of uniqueBranches) {
      try {
        onProgress?.(`Querying GitLab repository (branch: '${testBranch}')...`);
        const gitlabTreeUrl = `https://gitlab.com/api/v4/projects/${encodedProj}/repository/tree?recursive=true&ref=${testBranch}`;
        const glRes = await fetch(gitlabTreeUrl);
        if (glRes.ok) {
          const glTree = await glRes.json();
          if (Array.isArray(glTree)) {
            const codeFiles = glTree.filter((item: any) => item.type === 'blob' && isCodeFile(item.path));
            if (codeFiles.length > 0) {
              const selected = codeFiles.slice(0, 25);
              const files: FileData[] = [];
              await Promise.all(
                selected.map(async (f: any) => {
                  try {
                    const rawUrl = `https://gitlab.com/${owner}/${repo}/-/raw/${testBranch}/${f.path}`;
                    const rawRes = await fetch(rawUrl);
                    if (rawRes.ok) {
                      files.push({ path: f.path, content: await rawRes.text() });
                    }
                  } catch {
                    // Skip
                  }
                })
              );
              if (files.length > 0) {
                return {
                  files,
                  actualBranch: testBranch,
                  repoName,
                  repoUrl: normalizedUrl,
                };
              }
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // =========================================================================
  // Strategy 4: Common Standard Polyglot Entrypoint Probing
  // =========================================================================
  const standardProbePaths = [
    'app.py',
    'main.py',
    'setup.py',
    'index.ts',
    'src/index.ts',
    'index.js',
    'src/index.js',
    'main.go',
    'main.rs',
    'src/main.rs',
    'Main.java',
    'index.php',
    'Dockerfile',
    'server.js',
    'server.ts',
    'app.js',
    'app.ts',
  ];

  for (const testBranch of uniqueBranches) {
    const files: FileData[] = [];
    await Promise.all(
      standardProbePaths.map(async (p) => {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${testBranch}/${p}`;
          const res = await fetch(rawUrl);
          if (res.ok) {
            files.push({ path: p, content: await res.text() });
          }
        } catch {
          // Ignore
        }
      })
    );

    if (files.length > 0) {
      return {
        files,
        actualBranch: testBranch,
        repoName,
        repoUrl: normalizedUrl,
      };
    }
  }

  throw new Error(
    `Unable to retrieve source code files from ${repoName}. Verify that the repository is public and contains source files on branches [${uniqueBranches.join(', ')}].`
  );
}

/**
 * Backward compatibility wrapper
 */
export async function fetchRepositoryFiles(
  owner: string,
  repo: string,
  branch: string = 'main',
  maxFileSizeKb: number = 250
): Promise<FileData[]> {
  const result = await fetchUniversalRepositoryFiles(`${owner}/${repo}`, branch, maxFileSizeKb);
  return result.files;
}
