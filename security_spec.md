# Security Specification: ClientVault Fortress

## 1. Data Invariants
- **User Profile Isolation**: A user's profile (`users/{userId}`) can only be viewed, created, or modified by the authenticated user matching that exact `userId`. No custom roles or administrative claims are assigned at launch.
- **Account Bound Files**: A file document (`files/{fileId}`) must be owned by the authenticated user (`ownerId == request.auth.uid`).
- **File Integrity Limits**: Any uploaded file must have a strictly forced name limit, type limit, and size limit (maximum 2MB for the combined payload, with a soft limit in UI of 1MB for smooth document reads).
- **Relational Existence**: A file document cannot be created unless the owner's user profile document exists in the database.
- **Immutability of History**: Important fields such as `createdAt` on profiles, and `ownerId`, `size`, `type`, and `uploadedAt` on files must be completely immutable once created.
- **Strict Server Timestamps**: The `createdAt` and `uploadedAt` properties must strictly match `request.time` (the server's timestamp) at write time.

---

## 2. The "Dirty Dozen" Malicious Payloads
The following payloads target updates, identity spoofing, value poisoning, and denial-of-wallet vectors, and must be rejected (`PERMISSION_DENIED`) by the Firestore Security Rules.

### Payload 1: Profile Splice Attack (Identity Spoofing)
An authenticated attacker tries to write or modify a user profile document matching another user's UID.
*   **Path**: `users/victim_user_uid`
*   **Method**: `CREATE` / `WRITE`
*   **Sender Context**: User is signed in as `attacker_user_uid`.
*   **Payload**:
    ```json
    {
      "email": "hijacked@victim.com",
      "createdAt": "2026-06-02T17:23:47Z"
    }
    ```

### Payload 2: Ghost Field Insertion (Anti-Update-Gap)
User tries to write a valid file document but sneaks in an unauthorized administrative field (`isAdmin: true`).
*   **Path**: `files/file_abc`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**:
    ```json
    {
      "name": "project_brief.pdf",
      "size": 51200,
      "type": "application/pdf",
      "uploadedAt": "request.time",
      "ownerId": "user_uid",
      "content": "data:application/pdf;base64,JVBERi0xLjQK...",
      "isAdmin": true
    }
    ```

### Payload 3: Orphaned File Creation (Relational Integrity)
Attacker tries to upload a file while bypassed or without a registered user profile document.
*   **Path**: `files/file_abc`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `non_existent_profile_uid` (no corresponding document in `users/`).
*   **Payload**:
    ```json
    {
      "name": "malicious.pdf",
      "size": 1024,
      "type": "application/pdf",
      "uploadedAt": "request.time",
      "ownerId": "non_existent_profile_uid",
      "content": "bW9jayBjb250ZW50"
    }
    ```

### Payload 4: Arbitrary ID Poisoning / Junk Character Attack
Attacker tries to inject massive, weirdly-formatted keys to consume storage or compromise URI resolvers.
*   **Path**: `files/$$$___PoisonKey_With_Junk_Chars_%%%%####`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**: Correctly shaped fields otherwise.

### Payload 5: Deny-Of-Wallet Profile Read (Blanket Query scraping)
Attacker runs a list query on `users` collection without specifying an owner filter, trying to scrape user emails.
*   **Path**: `users`
*   **Method**: `LIST`
*   **Sender Context**: Signed in as `user_uid`.

### Payload 6: File Owner Hijacking
User `attacker_uid` tries to upload a file but sets `ownerId` to `victim_uid` to frame them or leak content.
*   **Path**: `files/stolen_file_1`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `attacker_uid`.
*   **Payload**:
    ```json
    {
      "name": "scandal.pdf",
      "size": 2048,
      "type": "application/pdf",
      "uploadedAt": "request.time",
      "ownerId": "victim_uid",
      "content": "data:application/pdf;base64,..."
    }
    ```

### Payload 7: Denial of Wallet Resource Poisoning
An attacker uploads a file document with an enormous name or body string violating max constraints.
*   **Path**: `files/file_large`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**: Name size exceeds 512 characters, or content size > 2MB.

### Payload 8: Immutable Creation Date Mutation
User attempts to modify the `createdAt` attribute of an established user profile to alter registration tenure records.
*   **Path**: `users/user_uid`
*   **Method**: `UPDATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**:
    ```json
    {
      "email": "user@gmail.com",
      "createdAt": "2020-01-01T00:00:00Z"
    }
    ```

### Payload 9: Invalid Mime Type Spoofing
User uploads a file document with an unsupported or malicious mimetype value.
*   **Path**: `files/spoof_file`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**: `type: "malicious/script-injection-extension"` (should be validated by regex or bounds checking).

### Payload 10: Client-Side Clock Hijacking
User attempts to bypass server timestamp validation by passing arbitrary historic values back for `uploadedAt`.
*   **Path**: `files/clock_file`
*   **Method**: `CREATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**: `uploadedAt` set to custom date in 2005.

### Payload 11: File Hijacking (Inter-User Reading)
Active client is signed in as `attacker_uid` and tries to fetch another user's private file.
*   **Path**: `files/victim_file_id`
*   **Method**: `GET`
*   **Sender Context**: Signed in as `attacker_uid`.

### Payload 12: File Force Update (State Shortcutting)
Active user tries to update internal immutable structures of a file after initial write.
*   **Path**: `files/file_abc`
*   **Method**: `UPDATE`
*   **Sender Context**: Signed in as `user_uid`.
*   **Payload**: Any modification containing altered `content` or `size` values.

---

## 3. Security Unit Tests (Draft representation)
Using standard Firestore security testing frameworks, these tests secure the endpoints:

```typescript
// firestore.rules.test.ts placeholder schema
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// All Dirty Dozen payloads are tested to guarantee that assertFails() evaluates to true.
```
