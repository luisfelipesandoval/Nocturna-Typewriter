import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Dirty Dozen security invariants are enforced in firestore.rules', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  // 1. Default deny catch-all
  assert.ok(rules.includes('match /{document=**}'));
  assert.ok(rules.includes('allow read, write: if false;'));

  // 2. Email verification requirement
  assert.ok(rules.includes('request.auth.token.email_verified == true'));

  // 3. Strict key validation against shadow fields
  assert.ok(rules.includes("data.keys().hasAll(['ownerId', 'title', 'createdAt', 'updatedAt'])"));
  assert.ok(rules.includes("data.keys().hasOnly(['ownerId', 'title', 'createdAt', 'updatedAt'])"));

  // 4. Strict server timestamp validation
  assert.ok(rules.includes('incoming().createdAt == request.time'));
  assert.ok(rules.includes('incoming().updatedAt == request.time'));

  // 5. Immutable field locks on update
  assert.ok(rules.includes('incoming().ownerId == existing().ownerId'));
  assert.ok(rules.includes('incoming().createdAt == existing().createdAt'));

  // 6. Allow checking existence of non-existent document (resource == null) before setDoc
  assert.ok(
    rules.includes('(resource == null || existing().ownerId == request.auth.uid)')
  );
});
