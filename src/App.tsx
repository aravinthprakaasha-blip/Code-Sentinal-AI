/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { ScannerView } from './components/ScannerView';
import { CodeSandboxView } from './components/CodeSandboxView';
import { BugsView } from './components/BugsView';
import { SecurityView } from './components/SecurityView';
import { QualityView } from './components/QualityView';
import { MLRiskView } from './components/MLRiskView';
import { ReviewerView } from './components/ReviewerView';
import { AssistantView } from './components/AssistantView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { LoginView } from './components/LoginView';
import { Finding, ScanResult, UserProfile } from './types';
import {
  syncUserProfile,
} from './services/firestoreService';
import {
  AnalysisHistoryItem,
  deleteAnalysis,
  getAnalysis,
  listAnalysisHistory,
} from './services/apiService';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [savedScans, setSavedScans] = useState<AnalysisHistoryItem[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const profile: UserProfile = {
          uid: fbUser.uid,
          email: fbUser.email || 'user@anonymous.local',
          displayName: fbUser.displayName || 'Security Engineer',
          photoURL: fbUser.photoURL || '',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        setCurrentUser(profile);
        setIsAuthReady(true);
        syncUserProfile(profile).catch(error => {
          console.error('Failed to sync the authenticated user profile:', error);
        });
      } else {
        setCurrentUser(null);
        setSavedScans([]);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load private analysis history through the Firebase-authenticated API.
  useEffect(() => {
    if (!currentUser) return;

    let active = true;
    listAnalysisHistory()
      .then(scans => {
        if (active) setSavedScans(scans);
      })
      .catch(error => {
        if (active) console.error('Failed to load private analysis history:', error);
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  const handleScanComplete = async (scan: ScanResult) => {
    setCurrentScan(scan);
    setActiveTab('overview');

    try {
      setSavedScans(await listAnalysisHistory());
    } catch (error) {
      console.error('Analysis completed but history could not be refreshed:', error);
    }
  };

  const handleSelectFindingForReview = (finding: Finding) => {
    setSelectedFinding(finding);
    setActiveTab('reviewer');
  };

  const handleSelectSavedScan = async (saved: AnalysisHistoryItem) => {
    try {
      const scan = await getAnalysis(saved.analysis_id);
      setCurrentScan(scan);
      setActiveTab('overview');
    } catch (error) {
      console.error('Failed to load saved analysis:', error);
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    try {
      await deleteAnalysis(scanId);
      setSavedScans(await listAnalysisHistory());
    } catch (err) {
      console.error('Failed to delete scan:', err);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3" role="status" aria-label="Loading account">
          <div className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span className="text-sm text-slate-400">Loading your workspace...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
        <Navbar
          currentUser={null}
          activeRepo=""
          onNavigateAuth={() => setActiveTab('auth')}
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/60">
          <LoginView
            currentUser={null}
            onNavigateScanner={() => setActiveTab('scanner')}
            onNavigateSandbox={() => setActiveTab('sandbox')}
            onNavigateOverview={() => setActiveTab('overview')}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <Navbar
        currentUser={currentUser}
        activeRepo={currentScan?.repo_name || ''}
        onNavigateAuth={() => setActiveTab('auth')}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentScan={currentScan}
          currentUser={currentUser}
        />

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/60">
          {activeTab === 'overview' && (
            <OverviewView
              currentScan={currentScan}
              savedScans={savedScans}
              onSelectSavedScan={handleSelectSavedScan}
              onDeleteScan={handleDeleteScan}
              onNavigateScanner={() => setActiveTab('scanner')}
              onNavigateSandbox={() => setActiveTab('sandbox')}
            />
          )}

          {activeTab === 'scanner' && (
            <ScannerView
              onScanComplete={handleScanComplete}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
            />
          )}

          {activeTab === 'sandbox' && (
            <CodeSandboxView
              onScanComplete={handleScanComplete}
              onNavigateReviewer={handleSelectFindingForReview}
            />
          )}

          {activeTab === 'bugs' && (
            <BugsView
              currentScan={currentScan}
              onSelectFindingForReview={handleSelectFindingForReview}
            />
          )}

          {activeTab === 'security' && (
            <SecurityView
              currentScan={currentScan}
              onSelectFindingForReview={handleSelectFindingForReview}
            />
          )}

          {activeTab === 'quality' && <QualityView currentScan={currentScan} />}

          {activeTab === 'ml_risk' && <MLRiskView currentScan={currentScan} />}

          {activeTab === 'reviewer' && (
            <ReviewerView
              currentScan={currentScan}
              selectedFinding={selectedFinding}
              onSelectFinding={setSelectedFinding}
            />
          )}

          {activeTab === 'assistant' && <AssistantView currentScan={currentScan} />}

          {activeTab === 'reports' && <ReportsView currentScan={currentScan} />}

          {activeTab === 'settings' && <SettingsView currentUser={currentUser} />}

          {activeTab === 'auth' && (
            <LoginView
              currentUser={currentUser}
              savedScansCount={savedScans.length}
              onNavigateScanner={() => setActiveTab('scanner')}
              onNavigateSandbox={() => setActiveTab('sandbox')}
              onNavigateOverview={() => setActiveTab('overview')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
