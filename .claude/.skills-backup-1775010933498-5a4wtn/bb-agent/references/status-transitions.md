# Status Transitions by Work Item Type

Valid statuses for each work item type, sourced from `api/src/schemas/work_item.py`.

## Epic

```
open → in_progress → done
                  ↘ cancelled
```

Statuses: `open`, `in_progress`, `done`, `cancelled`

## Story

```
open → confirmed → approved → in_progress → in_review → resolved → closed
                                   │
                                   └─ failed → (reimplement) → in_progress
                                   └─ needs_info → (clarify) → open
```

Statuses: `open`, `confirmed`, `approved`, `in_progress`, `in_review`, `resolved`, `closed`, `failed`, `needs_info`

## Task

```
backlog → todo → in_progress → in_review → done
```

Statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`

## Bug

```
open → confirmed → in_progress → in_review → resolved → closed
                                                      ↘ wont_fix
```

Statuses: `open`, `confirmed`, `in_progress`, `in_review`, `resolved`, `closed`, `wont_fix`

## Feature

```
open → confirmed → approved → in_progress → in_review → resolved → closed
```

Statuses: `open`, `confirmed`, `approved`, `in_progress`, `in_review`, `resolved`, `closed`

## Chore

```
open → in_progress → done
```

Statuses: `open`, `in_progress`, `done`

## Spike

```
open → in_progress → done
```

Statuses: `open`, `in_progress`, `done`

## Agent Flow Status Mapping

| Phase | Action | Status Transition |
|-------|--------|-------------------|
| Suggest | Post analysis plan | `open` → `confirmed` |
| Confirm | User approves | `confirmed` → `approved` (manual) |
| Execute | Start implementation | `approved`/`confirmed`/`open` → `in_progress` |
| Test Pass | All tests green | `in_progress` → `in_review` |
| Test Fail | Tests failing | `in_progress` → `failed` |
| Reimplement | Fix from failure | `failed` → `in_progress` |
| Merge | Code merged | `in_review` → `resolved` |
| Close | User accepts | `resolved` → `closed` (manual) |

## Default Statuses

| Type | Default |
|------|---------|
| epic | `open` |
| story | `open` |
| task | `backlog` |
| bug | `open` |
| feature | `open` |
| chore | `open` |
| spike | `open` |

## Priorities

Valid priorities (all types): `critical`, `high`, `medium`, `low`, `none`
