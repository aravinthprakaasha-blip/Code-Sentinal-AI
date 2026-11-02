/**
 * @file src/services/firestoreService.ts
 * Firestore database persistence layer for CodeSentry AI.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ScanResult, UserPreference, UserProfile } from '../types';

/**
 * Syncs user profile metadata on login
 */
export async function syncUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const existing = await getDoc(userRef);

    const now = new Date().toISOString();
    if (!existing.exists()) {
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || 'user@anonymous.local',
        displayName: user.displayName || 'Anonymous Engineer',
        photoURL: user.photoURL || '',
        createdAt: now,
        lastLoginAt: now,
      };
      await setDoc(userRef, newProfile);
    } else {
      await updateDoc(userRef, {
        lastLoginAt: now,
        displayName: user.displayName || existing.data().displayName || 'CodeSentry User',
        photoURL: user.photoURL || existing.data().photoURL || '',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves a scan result to the user's private scans subcollection
 */
export async function saveScanResult(userId: string, scan: ScanResult): Promise<void> {
  const path = `users/${userId}/scans/${scan.scan_id}`;
  try {
    const scanRef = doc(db, 'users', userId, 'scans', scan.scan_id);
    const payload = {
      id: scan.scan_id,
      userId: userId,
      repoUrl: scan.repo_url,
      repoName: scan.repo_name,
      branch: scan.branch,
      commitSha: scan.commit_sha,
      timestamp: scan.timestamp,
      qualityScore: scan.quality_score,
      riskScore: scan.risk_score,
      riskLabel: scan.risk_score > 66 ? 'HIGH' : scan.risk_score > 33 ? 'MEDIUM' : 'LOW',
      filesCount: scan.files.length,
      findingsCount: scan.findings.length,
      durationSeconds: scan.duration_seconds,
      status: 'completed',
      createdAt: scan.timestamp,
      summary: `Analyzed ${scan.files.length} files. Found ${scan.findings.length} issues. Risk: ${scan.risk_score}/100.`,
      findings: scan.findings.slice(0, 100), // Persist top 100 findings for storage limit safety
      predictions: scan.predictions,
    };
    await setDoc(scanRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Loads all scan records for a user
 */
export async function fetchUserScans(userId: string): Promise<any[]> {
  const path = `users/${userId}/scans`;
  try {
    const scansCol = collection(db, 'users', userId, 'scans');
    const q = query(scansCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Real-time listener for user scans
 */
export function subscribeToUserScans(
  userId: string,
  onUpdate: (scans: any[]) => void,
  onError?: (err: any) => void
) {
  const path = `users/${userId}/scans`;
  const scansCol = collection(db, 'users', userId, 'scans');
  const q = query(scansCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const scans = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      onUpdate(scans);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Deletes a scan record
 */
export async function deleteUserScan(userId: string, scanId: string): Promise<void> {
  const path = `users/${userId}/scans/${scanId}`;
  try {
    const scanRef = doc(db, 'users', userId, 'scans', scanId);
    await deleteDoc(scanRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Saves user settings and preferences
 */
export async function saveUserPreferences(userId: string, prefs: Partial<UserPreference>): Promise<void> {
  const path = `users/${userId}/settings/preferences`;
  try {
    const prefRef = doc(db, 'users', userId, 'settings', 'preferences');
    await setDoc(
      prefRef,
      {
        userId,
        geminiModel: prefs.geminiModel || 'models/gemini-2.5-flash',
        maxFileSizeKb: prefs.maxFileSizeKb || 250,
        maxScanTimeSec: prefs.maxScanTimeSec || 60,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Loads user preferences
 */
export async function getUserPreferences(userId: string): Promise<UserPreference | null> {
  const path = `users/${userId}/settings/preferences`;
  try {
    const prefRef = doc(db, 'users', userId, 'settings', 'preferences');
    const snapshot = await getDoc(prefRef);
    if (snapshot.exists()) {
      return snapshot.data() as UserPreference;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
