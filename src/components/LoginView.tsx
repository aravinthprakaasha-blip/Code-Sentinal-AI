/**
 * @file src/components/LoginView.tsx
 * Secure, modern authentication and profile management page for CodeSentry AI.
 * Supports Email/Password, Google OAuth, anonymous guest mode, and account statistics.
 */

import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  LogOut,
  Sparkles,
  SearchCode,
  Code2,
  Check,
  RefreshCw,
  FolderGit2,
  Cpu,
  Database,
  ExternalLink,
} from 'lucide-react';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  signInAsGuest,
  logOut,
  formatAuthError,
} from '../firebase';
import { UserProfile } from '../types';

interface LoginViewProps {
  currentUser: UserProfile | null;
  savedScansCount?: number;
  onNavigateScanner?: () => void;
  onNavigateSandbox?: () => void;
  onNavigateOverview?: () => void;
}

type AuthMode = 'signin' | 'signup' | 'reset';

export const LoginView: React.FC<LoginViewProps> = ({
  currentUser,
  savedScansCount = 0,
  onNavigateScanner,
  onNavigateSandbox,
  onNavigateOverview,
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Compute password strength
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Empty', color: 'bg-slate-700' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score += 1;

    switch (score) {
      case 1:
        return { score: 25, label: 'Weak', color: 'bg-rose-500' };
      case 2:
        return { score: 50, label: 'Fair', color: 'bg-amber-500' };
      case 3:
        return { score: 75, label: 'Good', color: 'bg-blue-500' };
      case 4:
        return { score: 100, label: 'Strong', color: 'bg-emerald-500' };
      default:
        return { score: 15, label: 'Too short', color: 'bg-rose-600' };
    }
  };

  const strength = getPasswordStrength(password);

  const clearAlerts = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!email) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      try {
        setIsLoading(true);
        await sendPasswordReset(email);
        setSuccessMessage('Password reset link sent! Check your inbox to reset your password.');
      } catch (err: any) {
        setErrorMessage(formatAuthError(err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please re-type your password confirmation.');
        return;
      }

      try {
        setIsLoading(true);
        await signUpWithEmail(email, password, displayName || undefined);
        setSuccessMessage('Account created successfully! Welcome to CodeSentry AI.');
      } catch (err: any) {
        setErrorMessage(formatAuthError(err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Sign in mode
    try {
      setIsLoading(true);
      await signInWithEmail(email, password);
      setSuccessMessage('Signed in successfully.');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearAlerts();
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      setSuccessMessage('Google authentication successful.');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    clearAlerts();
    try {
      setGuestLoading(true);
      await signInAsGuest();
      setSuccessMessage('Welcome! Signed in with temporary guest session.');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setGuestLoading(false);
    }
  };

  const handleSignOut = async () => {
    clearAlerts();
    try {
      await logOut();
      setSuccessMessage('Signed out cleanly.');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    }
  };

  // If user is currently authenticated, show account profile & workspace dashboard
  if (currentUser) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
        {/* Top Header Card */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center space-x-5">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-20 h-20 rounded-2xl border-2 border-cyan-500/50 object-cover shadow-lg shadow-cyan-500/20"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                  <User className="w-10 h-10" />
                </div>
              )}
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    {currentUser.displayName || 'Security Engineer'}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Authenticated</span>
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-0.5">{currentUser.email}</p>
                <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-2 font-mono">
                  <span>UID:</span>
                  <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 text-cyan-300">
                    {currentUser.uid}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 border border-slate-700 text-slate-300 text-sm font-medium transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Security & Workspace Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Saved Cloud Scans</p>
              <p className="text-2xl font-bold text-slate-100 mt-1 font-mono">{savedScansCount}</p>
              <p className="text-[11px] text-cyan-400 mt-1 flex items-center space-x-1">
                <Database className="w-3 h-3" />
                <span>Synced with Cloud Firestore</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
              <FolderGit2 className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Security Engine</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">Python Analysis</p>
              <p className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
                <Shield className="w-3 h-3" />
                <span>AST, Pyflakes, and Bandit</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Auto-Fix Engine</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">Suggestions</p>
              <p className="text-[11px] text-blue-400 mt-1 flex items-center space-x-1">
                <Cpu className="w-3 h-3" />
                <span>Reviewable correction templates</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800/50 flex items-center justify-center text-blue-400">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Quick Launchpad */}
        <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-slate-200 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Launch Workstation Tools</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={onNavigateScanner}
              className="p-5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-700 transition-all text-left flex items-start space-x-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                <SearchCode className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    Repository Scanner
                  </h3>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Scan a public GitHub repository or uploaded Python source with server-side analysis.
                </p>
              </div>
            </button>

            <button
              onClick={onNavigateSandbox}
              className="p-5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-700 transition-all text-left flex items-start space-x-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-950/80 border border-blue-800 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                <Code2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    Python Sandbox & Suggestions
                  </h3>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Paste raw source code or load vulnerable samples, detect AST flaws, and auto-correct bugs in-place.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated: Show Login / Registration View
  return (
    <div className="max-w-4xl mx-auto py-4 animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Brand & Feature Highlights */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 text-xs font-semibold tracking-wide">
              <Shield className="w-3.5 h-3.5" />
              <span>Identity & Access Vault</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
              Sign In to <br />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                CodeSentry AI
              </span>
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Authenticated Python static analysis with server-side security scanning and explainable risk results.
            </p>
          </div>

          <div className="space-y-3.5 pt-2">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Cloud Firestore Scan Persistence</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Save, audit, and compare historical scan reports across sessions securely.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Python Static Analysis</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Server-side Python AST, Pyflakes, and Bandit checks for public repositories or uploaded source.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Automated Bug Correction</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Instant error-correcting suggestions with syntax validation and visual diffing.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-400 flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Zero-Trust Architecture</span>
            </p>
            <p>
              Authentication tokens are verified directly by Firebase. Passwords never touch application servers.
            </p>
          </div>
        </div>

        {/* Right Side: Auth Form Card */}
        <div className="lg:col-span-7">
          <div className="p-6 md:p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur relative">
            {/* Mode Tabs */}
            <div className="flex border-b border-slate-800 mb-6 pb-2 space-x-4">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  clearAlerts();
                }}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  clearAlerts();
                }}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  clearAlerts();
                }}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all cursor-pointer ${
                  mode === 'reset'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Reset Password
              </button>
            </div>

            {/* Error Notification */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}

            {/* Success Notification */}
            {successMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs flex items-start space-x-2.5 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <div className="flex-1">{successMessage}</div>
              </div>
            )}

            {/* Google OAuth Button (available on signin and signup) */}
            {mode !== 'reset' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || isLoading || guestLoading}
                  className="w-full flex items-center justify-center space-x-3 py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm hover:border-slate-600 disabled:opacity-50"
                >
                  {googleLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                  )}
                  <span>
                    {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google Account'}
                  </span>
                </button>

                <div className="relative my-5 flex items-center justify-center">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                    Or with email credentials
                  </span>
                </div>
              </>
            )}

            {/* Email / Password Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Alex Vance"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="engineer@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reset');
                          clearAlerts();
                        }}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter for Sign Up */}
                  {mode === 'signup' && password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Strength:</span>
                        <span
                          className={
                            strength.score >= 75
                              ? 'text-emerald-400'
                              : strength.score >= 50
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {strength.label}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${strength.color} transition-all duration-300`}
                          style={{ width: `${strength.score}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || googleLoading || guestLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : mode === 'signin' ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In to CodeSentry</span>
                  </>
                ) : mode === 'signup' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Security Account</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Send Password Reset Link</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Guest Access Alternative */}
            {mode === 'signin' && (
              <div className="mt-5 pt-4 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={handleGuestSignIn}
                  disabled={guestLoading || isLoading || googleLoading}
                  className="text-xs text-slate-400 hover:text-cyan-300 transition-colors flex items-center justify-center space-x-1.5 mx-auto cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {guestLoading
                      ? 'Initializing temporary session...'
                      : 'Or test instantly with Guest Anonymous Mode'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
