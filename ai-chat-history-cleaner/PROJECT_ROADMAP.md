# Project Improvement Roadmap

## Product assessment

Chat History Cleaner already has a strong safety baseline: conversations start on Keep, deletion requires explicit confirmation, provider and account/workspace context are checked, and the documentation is unusually clear about private API and deletion limits.

The next improvements should reduce the chance of accidental deletion and make changes to private provider APIs easier to detect before release.

## Prioritized opportunities

### 1. Preview the deletion batch in confirmation

**Priority:** P0 - user safety
**Effort:** Medium

The confirmation currently shows the provider and exact number of conversations, but selections can include chats hidden by search or collapsed sections. Add a reviewable preview of the selected conversations, including title and archived status, with the total count clearly visible.

**Acceptance checks:**
- Preview items are exactly the IDs in the deletion plan, including hidden selections.
- The user can inspect the complete selection before confirming.
- Conversation titles remain in memory and are not added to persisted plans or logs.
- Cancel and Escape continue to send no deletion requests.

### 2. Establish automated release checks

**Priority:** P1 - reliability
**Effort:** Small to medium

Core tests run with `npm test`; browser tests currently require a local Chrome setup. Run the core suite automatically on changes and maintain a release checklist for browser tests, extension packaging, and provider-contract verification.

**Acceptance checks:**
- Core tests run automatically for pull requests and fail the check on regression.
- Release records whether ChatGPT and Claude browser tests were run and whether deletion remained mocked.
- Packaging excludes local profiles, dependencies, logs, and uncommitted files.

### 3. Improve history-load feedback and cancellation

**Priority:** P2 - usability
**Effort:** Medium

Large histories can take time to load. Expose useful progress, such as the current loading phase and conversations collected, and allow the user to cancel a load. Keep review and deletion controls unavailable until the load completes successfully.

**Acceptance checks:**
- Users can distinguish an active load from a stalled or completed load.
- Cancel stops further pagination and leaves the review in a clear, non-actionable state.
- An incomplete or cancelled load cannot create a deletion plan.

### 4. Reduce installation and update friction

**Priority:** P2 - adoption
**Effort:** Medium to large

The guides currently center on loading an unpacked extension. Assess a Chrome Web Store release and document a straightforward update and rollback path, including the permissions users should expect.

**Acceptance checks:**
- First-time installation does not require manually loading an unpacked folder if store distribution is approved.
- Release notes identify behavior changes and requested permissions.
- A tested rollback or recovery procedure is documented.

### 5. Validate demand for Claude project grouping

**Priority:** P3 - discovery before implementation
**Effort:** Large if pursued

Claude conversations are currently presented in a flat list, while ChatGPT supports project grouping and project-name search. First confirm that users need parity and that Claude exposes reliable project metadata through a supportable read path. Do not infer or guess private API contracts.

**Acceptance checks before implementation:**
- User feedback establishes the need and the most valuable grouping/search behavior.
- Read-only research confirms stable project identity and membership data.
- A prototype preserves account/workspace isolation and existing selection guarantees.

## Suggested sequence

1. Implement and test the confirmation preview.
2. Add automated core-test checks and a repeatable release checklist.
3. Improve loading feedback based on the actual pagination experience.
4. Evaluate store distribution as a separate release decision.
5. Revisit Claude project grouping after user feedback and read-only API validation.

## Product guardrails

- Keep deletion opt-in and never turn selection actions into immediate writes.
- Preserve provider, tab, and account/workspace isolation.
- Fail closed on incomplete loads, identity changes, or unrecognized API responses.
- Keep credentials, conversation content, and titles out of logs and persisted deletion plans.
- Verify destructive behavior with mocks; do not use real conversations for deletion tests.
