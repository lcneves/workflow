---
"@workflow/core": patch
"@workflow/world": patch
"@workflow/world-local": patch
"@workflow/world-postgres": patch
"@workflow/world-vercel": patch
---

perf: add events.createBatch() for batch event creation

- Add `createBatch()` method to Storage interface for creating multiple events atomically
- Use batch event creation in suspension handler for improved performance
- Use batch event creation for wait_completed events in runtime
