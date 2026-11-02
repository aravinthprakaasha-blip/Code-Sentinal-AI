/**
 * @file src/components/SettingsView.tsx
 * Settings and preferences management backed by Cloud Firestore.
 */

import React, { useState, useEffect } from 'react';
import { Settings, Database, Key, Sliders, ShieldCheck, Save, Check } from 'lucide-react';
import { UserPreference, UserProfile } from '../types';
import { getUserPreferences, saveUserPreferences } from '../services/firestoreService';

interface SettingsViewProps {
  currentUser: UserProfile | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const [model, setModel] = useState('models/gemini-2.5-flash');
  const [maxFileSizeKb, setMaxFileSizeKb] = useState(250);
  const [maxScanTimeSec, setMaxScanTimeSec] = useState(60);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const load = async () => {
      try {
        const prefs = await getUserPreferences(currentUser.uid);
        if (prefs) {
          setModel(prefs.geminiModel || 'models/gemini-2.5-flash');
          setMaxFileSizeKb(prefs.maxFileSizeKb || 250);
          setMaxScanTimeSec(prefs.maxScanTimeSec || 60);
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      }
    };
    load();
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await saveUserPreferences(currentUser.uid, {
        geminiModel: model,
        maxFileSizeKb,
        maxScanTimeSec,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          <span>Scanner & AI Settings</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure analysis engine bounds, LLM remediation models, and Firebase cloud persistence.
        </p>
      </div>

      {/* Cloud Firestore & Auth Status Card */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">Firebase Cloud Infrastructure</h2>
          </div>
          <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-mono font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Online & Connected</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">GCP Project</span>
            <span className="font-mono text-slate-300">gen-lang-client-0114039202</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Authentication</span>
            <span className="font-mono text-cyan-300">Google Sign-In Popup</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Security Rules</span>
            <span className="font-mono text-emerald-400">ABAC Strict Ownership</span>
          </div>
        </div>
      </div>

      {/* Engine Parameters */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-5">
        <div className="flex items-center space-x-2.5">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-200">Static Analysis & Engine Limits</h2>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Google Gemini Remediation Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="models/gemini-2.5-flash">models/gemini-2.5-flash (Fast, Low Latency, Accurate)</option>
              <option value="models/gemini-2.5-pro">models/gemini-2.5-pro (Deep Reasoning & Refactoring)</option>
              <option value="models/gemini-3.8-flash">models/gemini-3.8-flash (Latest Generation)</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-slate-300 font-medium">Max Individual Python File Size ({maxFileSizeKb} KB)</label>
              <span className="font-mono text-slate-400">{maxFileSizeKb} KB</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="25"
              value={maxFileSizeKb}
              onChange={(e) => setMaxFileSizeKb(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-0.5">Files larger than this limit are skipped with an ingestion warning.</p>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-slate-300 font-medium">Max Scan Timeout ({maxScanTimeSec}s)</label>
              <span className="font-mono text-slate-400">{maxScanTimeSec}s</span>
            </div>
            <input
              type="range"
              min="15"
              max="180"
              step="5"
              value={maxScanTimeSec}
              onChange={(e) => setMaxScanTimeSec(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        {currentUser && (
          <div className="pt-3 border-t border-slate-800 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Preferences Saved to Firestore</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Preferences'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
