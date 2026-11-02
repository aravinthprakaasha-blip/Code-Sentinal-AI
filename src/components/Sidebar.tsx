/**
 * @file src/components/Sidebar.tsx
 * Navigation sidebar with icons, badge counters, and active route styling.
 */

import React from 'react';
import {
  LayoutDashboard,
  SearchCode,
  Bug,
  ShieldAlert,
  Sparkles,
  Cpu,
  GitCompare,
  MessageSquareCode,
  FileText,
  Settings,
  Code2,
  Wand2,
  KeyRound,
  UserCheck,
} from 'lucide-react';
import { ScanResult, UserProfile } from '../types';

export type NavTab =
  | 'overview'
  | 'scanner'
  | 'sandbox'
  | 'bugs'
  | 'security'
  | 'quality'
  | 'ml_risk'
  | 'reviewer'
  | 'assistant'
  | 'reports'
  | 'settings'
  | 'auth';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentScan: ScanResult | null;
  currentUser?: UserProfile | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, currentScan, currentUser }) => {
  const bugCount = currentScan?.findings.filter(f => f.source === 'bug').length || 0;
  const secCount = currentScan?.findings.filter(f => f.source === 'security').length || 0;
  const qualCount = currentScan?.findings.filter(f => f.source === 'quality').length || 0;

  const navItems = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'scanner' as NavTab, label: 'Repository Scanner', icon: SearchCode, highlight: true },
    { id: 'sandbox' as NavTab, label: 'Self Text & Auto-Fix', icon: Code2, highlight: true },
    { id: 'bugs' as NavTab, label: 'Bug Detection', icon: Bug, badge: bugCount, badgeColor: 'bg-amber-950 text-amber-400 border-amber-800' },
    { id: 'security' as NavTab, label: 'Security Analysis', icon: ShieldAlert, badge: secCount, badgeColor: 'bg-rose-950 text-rose-400 border-rose-800' },
    { id: 'quality' as NavTab, label: 'Code Quality', icon: Sparkles, badge: currentScan ? `${currentScan.quality_score}` : undefined, badgeColor: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
    { id: 'ml_risk' as NavTab, label: 'ML Risk Prediction', icon: Cpu },
    { id: 'reviewer' as NavTab, label: 'AI Code Reviewer', icon: GitCompare },
    { id: 'assistant' as NavTab, label: 'Review Assistant', icon: MessageSquareCode },
    { id: 'reports' as NavTab, label: 'Reports', icon: FileText },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
    {
      id: 'auth' as NavTab,
      label: currentUser ? 'Account Vault' : 'Sign In / Register',
      icon: currentUser ? UserCheck : KeyRound,
      badge: currentUser ? 'Active' : undefined,
      badgeColor: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    },
  ];

  return (
    <aside className="w-64 bg-slate-950/70 border-r border-slate-800/80 p-4 flex flex-col justify-between shrink-0 h-[calc(100vh-4rem)]">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-blue-900/50 to-cyan-900/40 text-cyan-200 border border-cyan-800/60 shadow-sm shadow-cyan-900/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md border font-mono font-semibold ${
                    item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/70 text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center justify-between text-slate-300 font-medium">
          <span>Database Engine</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        </div>
        <p className="text-[10px] text-slate-400">Google Cloud Firestore</p>
        <div className="text-[10px] text-slate-400">ABAC Security Enforced</div>
      </div>
    </aside>
  );
};
