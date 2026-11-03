/**
 * @file src/components/Navbar.tsx
 * Top navigation bar with branding, scan badge, and Firebase Google Sign-In.
 */

import React from 'react';
import { Shield, ShieldAlert, CheckCircle, User, LogOut, LogIn } from 'lucide-react';
import { signInWithGoogle, logOut } from '../firebase';
import { UserProfile } from '../types';

interface NavbarProps {
  currentUser: UserProfile | null;
  activeRepo: string;
  onRefreshScans?: () => void;
  onNavigateAuth?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentUser, activeRepo, onNavigateAuth }) => {
  const handleSignOut = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await logOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              CodeSentry AI
            </span>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
              Code Security Analysis
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">Intelligent Code. Secure Software.</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {activeRepo && (
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Target:</span>
            <span className="font-mono text-cyan-300 font-medium truncate max-w-[200px]">{activeRepo}</span>
          </div>
        )}

        <div className="flex items-center space-x-3">
          {currentUser ? (
            <div
              onClick={onNavigateAuth}
              role="button"
              tabIndex={0}
              title="View Account Profile"
              className="flex items-center space-x-3 bg-slate-900/90 border border-slate-800 hover:border-cyan-800/80 px-3 py-1.5 rounded-xl cursor-pointer transition-colors"
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-7 h-7 rounded-full border border-cyan-500/40 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                  <User className="w-4 h-4" />
                </div>
              )}
              <div className="hidden sm:block text-left text-xs">
                <p className="font-medium text-slate-200 truncate max-w-[140px]">{currentUser.displayName}</p>
                <p className="text-[10px] text-cyan-400 flex items-center space-x-1">
                  <CheckCircle className="w-2.5 h-2.5" />
                  <span>Authenticated</span>
                </p>
              </div>
              <button
                onClick={handleSignOut}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onNavigateAuth}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-medium shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
