# CodeSentry AI Security Specification

## 1. Data Invariants

1. **User Identity Boundary**: Every document stored under `/users/{userId}` or any subcollection `/users/{userId}/*` must have matching authorization where `request.auth.uid == userId`.
2. **Scan Record Ownership**: A scan record stored under `/users/{userId}/scans/{scanId}` must contain `incoming().userId == request.auth.uid` and `incoming().id == scanId`.
3. **No Unauthenticated Access**: Unauthenticated requests (`request.auth == null`) are strictly denied on all paths.
4. **No Cross-User Access**: User A cannot read, list, create, update, or delete User B's scans or profile.
5. **Immutable Ownership Fields**: `userId` and `id` within `/users/{userId}/scans/{scanId}` cannot be changed during an update.
6. **No Blanket Reads**: No query delegation without relational owner verification on `resource.data.userId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Profile Read**: Anonymous/unauthenticated `GET /users/user_abc`.
2. **Cross-Tenant Scan Spoof**: User `attacker` writing to `/users/victim/scans/scan_123`.
3. **Ghost Field Injection**: Adding an unverified field `isAdmin: true` during profile creation.
4. **Scan Record Hijacking**: User `attacker` reading `/users/victim/scans/scan_123`.
5. **Path Traversal ID Poisoning**: Using a 500-byte string with forbidden shell characters for `scanId`.
6. **Cross-User List Scan Scraping**: User `attacker` querying `users/victim/scans` without ownership.
7. **Tampering Immutable ID**: User attempting to update `scan_123` with a modified `userId: 'victim'`.
8. **Negative / NaN Risk Score**: Attempting to store an invalid non-numeric or overflow risk score.
9. **Fake Timestamp Injection**: Attempting to overwrite `createdAt` with a backdated client timestamp.
10. **Arbitrary Collection Creation**: Attempting to write to root `/system_logs` or top-level `/scans`.
11. **Excessive String Payload**: Writing a 2MB payload into repoUrl.
12. **Public Setting Override**: Attacker attempting to write to `/users/victim/settings/preferences`.

## 3. Security Assertions & Expected Status
All 12 attacks must strictly return `PERMISSION_DENIED` under `firestore.rules`.
