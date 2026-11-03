# Architecture decision records

This folder holds decisions about the data model, the contracts between
modules, and module boundaries. It is not a place for feature specs
(those live in issues) or for design explorations (those live in
`docs/superpowers/specs/`). A record belongs here when a later change
could silently contradict it.

## Naming

`NNNN-kebab-title.md`, four digits, numbered in the order they are
opened. A number is never reused, even if the record is rejected.

## Statuses

| Status | Meaning |
| --- | --- |
| Proposed | Written, not yet signed off. Context only; it does not bind. |
| Accepted (date, owner) | Signed off by the owner. Binding. |
| Superseded by NNNN | Replaced by a later accepted record. No longer binding. |
| Rejected | Considered and declined. Kept so the question is not reopened blindly. |

## Binding rule

Only Accepted records bind. Proposed records are context only.

An architect or reviewer who finds a request, plan, or diff in conflict
with an Accepted record flags the conflict; they do not work around it.
Changing an Accepted decision takes a new record that supersedes it, and
the old record's status changes to `Superseded by NNNN` in the same pull
request. The orchestration agents read this folder before planning or
reviewing work.

The status line in the record itself is authoritative; the index row below
only mirrors it. To accept a record, the owner edits its status line to
`Accepted (YYYY-MM-DD, owner)` and the record's index row to match, in the
same edit, in the pull request that introduces it. Supersession updates both
in the same way. Merging without the edit leaves the record Proposed. If the
two ever disagree, the record's status line wins and the index row is a bug.

## Template

```
# NNNN. Title

Status: Proposed
Date: YYYY-MM-DD
Deciders: <who signs off>
Base commit: <short sha the evidence was read at>

## Context        the problem, the evidence, what is constrained
## Options        each with migration path, impact, estimate, risks
## Decision       the choice, and what would reopen it
## Consequences   positive, negative, what binds once Accepted
## Follow-ups     the packages that carry the decision out (described, not filed)
## References     files, issues, research
```

Cite code by file and symbol, never by line number, and name the commit
the evidence was read at. Line numbers rot on the first refactor.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-wall-model.md) | Wall model: room-first versus wall-first | Proposed |

## Standing rules elsewhere

- Repo conventions: [`AGENTS.md`](../../AGENTS.md).
- Schema contract: [`docs/schema.md`](../schema.md). It still describes v1;
  the v2 shape lives in `src/shared/schema/types.ts`.
- The v2 schema decisions (floors, stairs, roofs; derived values never
  stored): [the design comment on issue #69](https://github.com/sv-tmueller/3d-casaplazai/issues/69#issuecomment-6260107182).
