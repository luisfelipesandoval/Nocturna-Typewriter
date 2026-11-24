# Security Specification — Nocturna Typewriter Cloud Sync

## 1. Data Invariants
1. **Identity Isolation**: A `Notebook` under `/users/{userId}/notebooks/{notebookId}` can only be read, created, updated, or deleted by an authenticated, email-verified user whose `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
2. **Master Gate Relational Sync**: A `NotebookPage` under `/users/{userId}/notebooks/{notebookId}/pages/{pageId}` cannot exist or be modified unless the parent `/users/{userId}/notebooks/{notebookId}` exists and is owned by `request.auth.uid`.
3. **Immutable Lineage & Temporal Integrity**: `ownerId`, `notebookId`, and `createdAt` are immutable on update, and `createdAt` / `updatedAt` must equal `request.time`.
4. **Strict Key & Size Boundaries**: Shadow fields are rejected via `hasAll` and `hasOnly`. Every string (`ownerId`, `notebookId`, `title`, `content`) enforces strict `.size()` and regex boundaries.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Create**: Creating `/users/u1/notebooks/nb1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Create**: Creating `/users/u1/notebooks/nb1` with `email_verified == false` -> `PERMISSION_DENIED`.
3. **Cross-User Spoofing**: Authenticated as `u2`, creating `/users/u1/notebooks/nb1` with `ownerId: 'u1'` -> `PERMISSION_DENIED`.
4. **Owner Field Mismatch**: Authenticated as `u1`, creating `/users/u1/notebooks/nb1` with `ownerId: 'u2'` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Create**: Creating `/users/u1/notebooks/nb1` with `{ ownerId: 'u1', title: 'Test', createdAt: request.time, updatedAt: request.time, isAdmin: true }` -> `PERMISSION_DENIED`.
6. **Title Overflow Attack**: Creating `/users/u1/notebooks/nb1` with `title` length > 200 chars -> `PERMISSION_DENIED`.
7. **Forged Client Timestamp**: Creating `/users/u1/notebooks/nb1` with `createdAt` != `request.time` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation on Update**: Updating `/users/u1/notebooks/nb1` changing `createdAt` or `ownerId` -> `PERMISSION_DENIED`.
9. **Orphaned Page Creation**: Creating `/users/u1/notebooks/nonExistentNb/pages/pg1` when parent notebook does not exist -> `PERMISSION_DENIED`.
10. **Page Content Exhaustion**: Updating `/users/u1/notebooks/nb1/pages/pg1` with `content` length > 50,000 chars -> `PERMISSION_DENIED`.
11. **Invalid Page Number**: Updating `/users/u1/notebooks/nb1/pages/pg1` with `pageNumber: -1` or `pageNumber: 99999` -> `PERMISSION_DENIED`.
12. **Unauthorized List Scraping**: Listing `/users/u1/notebooks` as `u2` -> `PERMISSION_DENIED`.
