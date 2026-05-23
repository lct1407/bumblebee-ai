# Phase 7 — ChatSession Tier 2 + Notifications + ReplayDebugger + pypi Publishing

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 7
- Plugin design: [`../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md`](../reports/brainstormer-260518-1725-bb-v3-extensible-framework.md)
- Forge ChatSession reference: [`../reports/comparison-260518-0125-forge-vs-bb-v3.md`](../reports/comparison-260518-0125-forge-vs-bb-v3.md)
- Previous: [`./phase-06-knowledge-skills-agent-definition.md`](./phase-06-knowledge-skills-agent-definition.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🟡 High — final feature breadth + distribution surface |
| Status | 🚧 Partial (~40%) — ChatSession stub works; Notifications + Replay UI absent; pypi pipeline not built |
| Duration | 2.5 weeks (was 2w; +0.5w for pypi publishing per v1.1) |
| Acceptance | User chats → Assistant suggests issue → user approves → issue created; Notifications panel works; ReplayDebugger reproduces a session; `pip install bumblebee-ai` from TestPyPI succeeds |

**Brief:** Productionize ChatSession Tier 2 (Q&A + suggest via HITL). Wire Notification endpoints + web panel. Build ReplayDebugger (event log → re-execute deterministically). Complete `bumblebee` console_scripts. Set up GitHub Actions for TestPyPI → PyPI publish on git tag.

---

## Key Insights

### ChatSession Tier 2 boundary
- DO: Q&A about project, suggest issue drafts, suggest knowledge entries, query state
- DON'T: Trigger workflows directly (that's Tier 3 risk); user must explicitly approve suggestions

### Replay Debugger principle
- Given (session_id, checkpoint_id), restore state and re-execute
- Deterministic: same prompts + same checkpoints → same trace (modulo LLM stochasticity)
- LLM stochasticity captured via temperature=0 + seed pinning where supported

### pypi pipeline
- TestPyPI for every git tag (rc1, rc2, etc.); PyPI on stable tag (vX.Y.Z)
- Build wheel on 3 OS × 2 Python versions matrix; combine
- Smoke test in clean venv before upload

---

## Requirements

### Functional
- F1. ChatSession HITL flow: assistant calls `suggest_issue` → draft persisted → user approves via UI → real issue created
- F2. Notification endpoints: GET /api/notifications + PATCH /api/notifications/{id} (mark read)
- F3. Notification triggers: session_complete, session_failed, budget_warning, mention, review_requested
- F4. Web Notifications panel (bell icon header; dropdown)
- F5. ReplayDebugger CLI: `bumblebee replay --session X [--from-checkpoint Y]`
- F6. Replay UI in web: button on session/issue detail → opens replay viewer
- F7. `bumblebee` console_scripts complete: version/init/db/server/daemon/issue/chat/plugins/replay
- F8. GitHub Actions: on tag push (`v*.*.*`), build wheel matrix → TestPyPI upload → smoke test → PyPI upload (manual gate)
- F9. Smoke test in clean venv on Linux/macOS/Windows post-upload

### Non-functional
- N1. Chat reply <5s p95
- N2. Replay re-execution time ≤2× original (deterministic; no LLM cache requires re-call)
- N3. Notification poll <100ms (or WS push)
- N4. pypi wheel <10MB
- N5. CI pipeline runtime <15min

---

## Architecture

### ChatSession HITL Suggest Flow

```
User chats: "Create issue for OAuth bug"
  ↓
Assistant session loads (role=assistant, ChatSession context)
  ↓
LLM call → tool_call: suggest_issue(draft={...})
  ↓
ToolExecutor.execute("suggest_issue", draft, session)
  ├── Persist draft in chat_session.metadata["pending_suggestions"]
  ├── Emit Event(chat_suggestion, payload={kind: "issue", draft: {...}})
  └── Return ToolResult(status=success, summary="Suggested 1 issue draft. Awaiting approval.")
  ↓
WS broadcast → web shows approval card
  ↓
User clicks "Approve" → POST /api/chat/sessions/{id}/suggestions/{kind}/approve
  ↓
ChatSuggestionService.approve_issue(draft, project)
  ├── Create real Issue row
  ├── Emit Event(issue_created, source=chat, actor=user_id)
  └── Optionally trigger workflow (if user checked "auto-run")
  ↓
Assistant continues turn: "Created BB-123. Run triage?"
```

### Replay Debugger

```python
# bumblebee/services/obs/replay.py
async def replay_session(session_id, from_checkpoint=None):
    """Re-execute a session from event log + optional checkpoint."""
    session = await db.get(AgentSession, session_id)
    events = await get_events_for_session(db, session_id)
    
    if from_checkpoint:
        # Restore state from PostgresSaver checkpoint
        state = await load_checkpoint(from_checkpoint)
        events = [e for e in events if e.occurred_at > checkpoint_time]
    else:
        state = initial_state_from_events(events[:1])
    
    # Re-execute via same harness but with provider="replay"
    # which returns canned LLM responses from event log
    new_session = await create_replay_session(session, state)
    result = await harness.run_role(
        db, session=new_session, role=session.role,
        provider_override="replay",
        replay_source_events=events,
    )
    
    # Diff actual vs original
    diff = compute_diff(events, new_session.events)
    return ReplayResult(new_session_id=new_session.id, diff=diff)
```

### pypi Pipeline

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*.*.*']
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        python: ['3.12', '3.13']
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '${{ matrix.python }}' }
      - run: pip install build
      - run: python -m build
      - run: pip install dist/*.whl
      - run: pytest tests/ -q
      - uses: actions/upload-artifact@v4
        with: { name: dist-${{ matrix.os }}-${{ matrix.python }}, path: dist/* }
  
  publish-testpypi:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: pypa/gh-action-pypi-publish@release/v1
        with: { repository-url: https://test.pypi.org/legacy/ }
  
  publish-pypi:
    needs: publish-testpypi
    runs-on: ubuntu-latest
    environment: pypi-publish  # requires manual approval
    steps:
      - uses: actions/download-artifact@v4
      - uses: pypa/gh-action-pypi-publish@release/v1
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/routers/chat.py` | Add suggestion approval endpoints |
| `bumblebee/services/tool/handlers/hitl.py` | Persist suggest_issue draft in chat session metadata |
| `bumblebee/cli.py` | Add `replay`, `chat`, `issue` subcommand groups |
| `bumblebee/main.py` | Register notifications + replay endpoints |
| `web/src/components/agent-stream-viewer.tsx` | Add approval card when chat_suggestion event |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/chat/suggestion_service.py` | Approve/reject draft → real entity |
| `bumblebee/routers/notifications.py` | CRUD + WS feed |
| `bumblebee/services/notifications/dispatcher.py` | Emit notifications on session events |
| `bumblebee/services/obs/replay.py` | Replay debugger |
| `bumblebee/routers/replay.py` | `POST /api/replay/{session_id}` |
| `web/src/components/notification-bell.tsx` | Header bell icon + dropdown |
| `web/src/components/notification-list.tsx` | Notification panel |
| `web/src/app/(protected)/projects/[slug]/replay/[session_id]/page.tsx` | Replay UI |
| `web/src/components/replay-viewer.tsx` | Diff original vs replay |
| `.github/workflows/release.yml` | pypi publish pipeline |
| `RELEASE.md` | Release process doc |
| `tests/test_chat_suggestion.py` | HITL approve flow |
| `tests/test_notifications.py` | Trigger + read |
| `tests/test_replay.py` | Replay determinism |
| `tests/test_pypi_build.py` | Wheel build smoke |
| `docs/release-process.md` | How to cut a release |

### Delete

- (none)

---

## Implementation Steps

### Week 1 — ChatSession HITL + Notifications

1. **Day 1: Suggestion persistence**
   - `suggest_issue` tool: write draft into `chat_session.metadata["pending_suggestions"]`
   - Emit `chat_suggestion` event with draft

2. **Day 2: Approval endpoints**
   - `POST /api/projects/{slug}/chat/sessions/{id}/suggestions/{kind}/approve` → creates entity
   - `POST .../reject` → clears draft

3. **Day 3: Web approval UI**
   - Detect `chat_suggestion` events in stream
   - Render approval card inline (Accept / Modify / Reject)
   - On accept: POST approve endpoint; refresh issue list

4. **Day 4: Notification dispatcher**
   - On Event(session_completed/failed, budget_warning) → create Notification row
   - Per-recipient routing (Phase 7 baseline: project owner; Phase 8+: assignees)

5. **Day 5: Notification endpoints + Web bell**
   - `GET /api/notifications?unread=true`
   - `PATCH /api/notifications/{id}` → mark read
   - Web bell icon + dropdown panel
   - WS push on new notification

### Week 2 — Replay Debugger + CLI

6. **Day 6: Replay service**
   - `services/obs/replay.py`: load events + state, re-execute with `provider=replay` (canned responses)
   - `provider_override="replay"`: returns events[i].payload.output instead of calling LLM

7. **Day 7: Replay endpoint + CLI**
   - `POST /api/replay/{session_id}` → returns new_session_id + diff
   - `bumblebee replay --session X` CLI variant

8. **Day 8: Web replay viewer**
   - Side-by-side diff: original events vs replay events
   - Highlight divergence points

9. **Day 9: CLI completeness**
   - `bumblebee issue create/list/show` (Python CLI; complements TS CLI)
   - `bumblebee chat start/send`
   - `bumblebee plugins list/reload`
   - `bumblebee replay`
   - All wired to REST API

### Week 3 — pypi pipeline

10. **Day 10: Build wheel locally**
    - `python -m build` in clean venv
    - Verify wheel installs in another clean venv

11. **Day 11: GitHub Actions release.yml**
    - Matrix build (3 OS × 2 Python)
    - Upload artifacts
    - TestPyPI publish stage

12. **Day 12: TestPyPI smoke test**
    - `pip install -i https://test.pypi.org/simple/ bumblebee-ai`
    - Run `bumblebee version && db migrate && server` in clean venv
    - 3 OS verify

13. **Day 13: Manual gate + PyPI**
    - Environment `pypi-publish` requires reviewer approval
    - Test by cutting `v0.3.0-rc1` tag → goes to TestPyPI only
    - Tag `v0.3.0` → after approval → real PyPI

14. **Day 14: Release docs + acceptance**
    - `RELEASE.md`: tag/branch conventions + checklist
    - `docs/release-process.md`: detailed walkthrough
    - Run full E2E: `pip install bumblebee-ai` on each OS + scenario C
    - Commit: `feat(phase-7): chat HITL + notifications + replay + pypi pipeline`

15. **Day 15: Buffer**

---

## Todo List

- [ ] Suggest_issue/knowledge persistence in chat session
- [ ] Approval/reject endpoints
- [ ] Web approval card UI
- [ ] Notification dispatcher
- [ ] /api/notifications endpoints
- [ ] Web notification bell + panel
- [ ] WS push on new notification
- [ ] Replay service core
- [ ] /api/replay endpoint
- [ ] bumblebee replay CLI
- [ ] Web replay viewer (diff)
- [ ] Python CLI completeness (issue/chat/plugins/replay)
- [ ] Wheel build local verify
- [ ] release.yml workflow (3 OS × 2 Python)
- [ ] TestPyPI upload + smoke
- [ ] PyPI manual gate + first stable
- [ ] RELEASE.md + docs/release-process.md
- [ ] Phase 7 commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| Chat "create issue X" → suggest → approve → BB-N exists | manual demo |
| Notifications appear on session events | trigger session, check bell |
| Replay reproduces session deterministically (modulo LLM seed) | tests/test_replay |
| `pip install -i testpypi bumblebee-ai` in clean venv works | 3 OS smoke test |
| Tag push triggers wheel build matrix | CI green |
| Manual PyPI gate prevents accidental publish | env reviewer required |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| Approval race condition (user approves twice) | M | M | Idempotency: check if draft already processed |
| Replay non-deterministic on LLM | H | M | Honest acknowledge; use temperature=0 + seed; show divergence in viewer |
| Notification spam (too many) | M | L | Dedupe + batching (1 per minute per type per recipient) |
| pypi token leak in CI logs | L | H | GitHub Actions secrets; never echo |
| Wheel build asyncpg native compile fails | M | H | Use prebuilt wheels; fallback psycopg-binary |
| TestPyPI naming squat after Phase 0 reserve | L | M | Reserved Phase 0; sanity check Phase 7 |

---

## Security Considerations

- **Chat suggest_issue**: draft from LLM is untrusted; sanitize before persisting (no HTML, length cap, type validate)
- **Approval auth**: only project member can approve; check user_id in session vs project membership (Phase 7+ auth)
- **Replay**: re-runs harness with same tools; rate-limit (1 replay per session per minute)
- **pypi credentials**: GitHub Actions OIDC or token in secret; rotate quarterly
- **Notification content**: don't leak raw error text; reference issue/session ID

---

## Next Steps

**Unblocks:**
- Phase 8 (Cutover) — pypi pipeline must exist for v3.0 ship

**Depends on:**
- Phase 6 (Knowledge + reference plugin) — chat assistant uses knowledge query
- Phase 4 (Web MVP) — UI infrastructure

---

## Unresolved Questions

1. **WS vs SSE for notifications**: WS already in place; reuse. SSE simpler but Phase 4 chose WS.
2. **Replay LLM**: re-call or use canned? Phase 7 day 6 decision: canned (replay mode); option to "re-run live" for forward debugging.
3. **TestPyPI vs PyPI version mismatch**: rc tags → TestPyPI only; stable tags → both. Document in RELEASE.md.
4. **Notification retention**: archive after 30 days? Or never? Phase 7 baseline: soft delete after 90d.
5. **Python CLI vs TS CLI overlap**: Python `bumblebee issue` overlaps TS `bb issue`. Decision: Python = server-side admin; TS = client-side scripting. Document boundary.
