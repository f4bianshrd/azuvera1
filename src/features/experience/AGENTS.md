# Module rules
- Experience reports (src/features/experience): own drafts/attachments/comments go through Dexie + outbox (src/lib/sync/experience-sync.ts); review, requirements admin, export and history are online; the counting rule exists in progress.ts and experience_year_counts and must stay in sync with the tests — keeps offline use and one consistent count.
