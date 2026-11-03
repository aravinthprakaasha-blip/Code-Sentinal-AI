/**
 * @file src/components/SettingsView.tsx
 * Live backend status and the limits the server actually enforces.
 *
 * Scan limits and the Gemini model are server-side settings (environment
 * variables on the backend), so they are shown here read-only rather than as
 * controls that would have no effect.
 */

import React, { useEffect, useState } from 'react';
import { Settings, Database, Sliders, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { UserProfile } from '../types';
import { BackendHealth, getBackendHealth } from '../services/apiService';
import { firebaseProjectId } from '../firebase';

interface SettingsViewProps {
  currentUser: UserProfile | null;
}

const StatusRow: React.FC<{ label: string; ok: boolean; detail?: string }> = ({ label, ok, detail }) => (
  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2">
    {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
    <div>
      <span className="block text-slate-200 text-xs font-medium">{label}</span>
      <span className="block text-[11px] text-slate-400">{detail || (ok ? 'Configured' : 'Not configured')}</span>
    </div>
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await getBackendHealth());
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'The backend could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const config = health?.configuration;
  const limits = health?.limits || {};

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <span>System Status & Limits</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Live status reported by the CodeSentry API. Scan limits and the AI model are configured on the server.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">Backend API</h2>
          </div>
          {health ? (
            <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-mono font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Reachable · v{health.version}</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[11px] font-mono font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{loading ? 'Checking…' : 'Unreachable'}</span>
            </span>
          )}
        </div>

        {error && <p className="text-xs text-rose-300" role="alert">{error}</p>}

        {config && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <StatusRow label="Firebase Admin (auth & history)" ok={config.firebase_auth} />
              <StatusRow
                label="Gemini AI review"
                ok={config.gemini}
                detail={config.gemini ? `Model: ${config.gemini_model}` : 'GEMINI_API_KEY not set — AI review disabled'}
              />
              <StatusRow
                label="GitHub API token"
                ok={config.github_token}
                detail={config.github_token ? 'Higher GitHub rate limit for public repos' : 'Optional — anonymous limit is 60 requests/hour'}
              />
              <StatusRow label="Dependency checks (OSV.dev)" ok={config.dependency_scan} detail={config.dependency_scan ? 'Enabled' : 'Disabled on this server'} />
              <StatusRow label="Bandit (Python security)" ok={config.bandit} />
              <StatusRow label="Pyflakes (Python bugs)" ok={config.pyflakes} />
            </div>
            <p className="text-[11px] text-slate-500">{health?.note}</p>
          </>
        )}
      </div>

      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center space-x-2.5">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-200">Scan Limits (enforced by the server)</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {[
            ['Files per repository', limits.max_repository_files],
            ['Max file size', limits.max_source_file_kb !== undefined ? `${limits.max_source_file_kb} KB` : undefined],
            ['Max repository size', limits.max_repository_mb !== undefined ? `${limits.max_repository_mb} MB` : undefined],
            ['Retrieval time limit', limits.repository_timeout_seconds !== undefined ? `${limits.repository_timeout_seconds} s` : undefined],
            ['Scans per minute', limits.analysis_requests_per_minute],
            ['AI requests per minute', limits.ai_requests_per_minute],
          ].map(([label, value]) => (
            <div key={label as string} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">{label}</span>
              <span className="font-mono text-slate-200">{value ?? '—'}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Files beyond these limits are reported as skipped in each scan's coverage report. Administrators change them with
          backend environment variables (see README).
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 text-xs">
        <h2 className="text-sm font-semibold text-slate-200">Account</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Signed in as</span>
            <span className="font-mono text-slate-300 break-all">{currentUser?.email || '—'}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Firebase project</span>
            <span className="font-mono text-slate-300 break-all">{firebaseProjectId || 'not configured'}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">History privacy</span>
            <span className="text-slate-300">Stored per account; only you can read or delete it</span>
          </div>
        </div>
      </div>
    </div>
  );
};
