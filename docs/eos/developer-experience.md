# EOS Developer Experience — guided workflow & machine contracts

> This is the **contract** document for the guided workflow: the state model, the transition tables,
> the Next-Best-Action JSON contract, the agent/skill mapping contract and the CLI output + exit-code
> contract. It is normative — the implementation in `.github/eos/` and the tests in
> `.github/eos/*.test.mjs` are locked to it.

**The whole point:** you should not have to read EOS documentation to know what to do next.
One entry point, one current work object, one recommended next action, and a machine that refuses
to let unverified work be promoted.

```
Resume / Next  →  do the one recommended action  →  Verify  →  Next
```

## 1. The one loop (what a developer actually types)

```sh
node .github/eos/eos.mjs resume     # what was I doing? what is blocking it?
node .github/eos/eos.mjs next       # the single recommended next action
node .github/eos/eos.mjs check --gate story-ready --scope STORY-012
node .github/eos/eos.mjs transition --scope story --id STORY-012 --to READY_FOR_DEV
```

In Copilot Chat the same loop is `eos-guide` → `/eos-next` → `/eos-resume` → `/eos-status`.
In VS Code it is the **EOS: Next / Resume / Verify Current Gate / Release Status** tasks
(`cp .vscode/tasks.json.example .vscode/tasks.json`, or `eos init --write`).

Nothing here needs the network, a cloud service, a VS Code extension or a package manager.
Want to watch the whole loop before trusting it? `node .github/eos/journey.demo.mjs` replays a
complete feature — blocked story → repair → verify → an input moves (STALE) → recover → merge →
release verdict — in a throwaway copy of this repository, and prints the real output of every step.

## 2. Design principles (why it behaves the way it does)

| # | Principle | Consequence in the implementation |
|---|---|---|
| 1 | State over narrative | The current phase is derived from artifacts, evidence and the ledger — never from a prose summary or a chat transcript |
| 2 | Recommendation over menu | `eos next` prints exactly **one** action; everything else is folded into `--all` |
| 3 | Intent over framework jargon | Entry points are "resume work", "fix a bug", "prepare a release" — not "pick G5" or "pick a BMAD skill" |
| 4 | Branch the flow, never leave an unknown path | Every change type has an explicit gate policy; a skip is a recorded `NOT_APPLICABLE`, never an accident |
| 5 | Free exploration, controlled promotion | Drafting and spikes are unrestricted; `READY_FOR_DEV` / `MERGED` / release promotion require evidence |
| 6 | Progressive disclosure | Default output is six short blocks; detail is behind `--why`, `--all` and `explain` |
| 7 | Never fake a capability | EOS cannot switch a Copilot agent for you, so it hands off honestly instead of claiming it did |

**The LLM may** explain a recommendation, do the work, draft artifacts and summarize failures.
**The LLM may not** mark a gate PASS, approve a waiver, edit workflow state, infer an approval from
prose, or release around the router. Those paths exist only as deterministic code.

## 3. Architecture (four separated components)

```
Project State Model   .eos/project.json · workflow.json · gates.json · agent-map.json · ledger
        ↓
Gate & Transition Engine   deterministic evaluators + evidence freshness + waivers
        ↓
Next Best Action Engine    pure function: state → exactly one recommended action
        ↓
Experience Layer           CLI · eos-guide agent · /eos-next /eos-resume /eos-status · VS Code tasks
```

Layout on disk:

```
.eos/
  project.json          # what this project IS (tracked, authoritative)
  workflow.json         # change-type gate policy + state machines (tracked, CODEOWNERS-protected)
  gates.json            # gate definitions + versions (tracked, CODEOWNERS-protected)
  agent-map.json        # action → agent / prompt / minimal BMAD skill chain (tracked)
  schemas/              # JSON Schemas for every file above
  evidence/             # machine-generated gate evidence (tracked — release evidence must be shared)
  waivers/              # controlled exceptions (tracked)
  ledger/events.jsonl   # append-only, hash-chained transition + gate ledger (tracked)
  handoffs/             # minimal agent handoff context packages (local cache, gitignored)
  local/active-work.json# this machine's current focus only (gitignored, never authoritative)
```

`.eos/local/active-work.json` holds a scope id and a change type. It never holds a gate result, an
approval or a release state — those live in the ledger and in evidence files.

## 4. State model (three scopes, not one global machine)

### 4.1 Product baseline

```
UNINITIALIZED → DISCOVERY → REQUIREMENTS_BASELINED → PRD_APPROVED → ARCHITECTURE_APPROVED → ACTIVE
```

The product state is **derived**, never declared: the engine walks this machine from `UNINITIALIZED`
and advances while the next guard holds. `eos transition --scope product` therefore refuses to set it
by hand and instead names the guard that is still missing.

### 4.2 Change / story

```
DRAFT → IN_REVIEW → READY_FOR_DEV → IN_DEVELOPMENT → READY_FOR_TEST → VERIFIED → MERGED
```

Explicit rollbacks are legal (finding a defect must not require lying about state):
`READY_FOR_TEST → IN_DEVELOPMENT`, `VERIFIED → IN_DEVELOPMENT`, `READY_FOR_DEV → DRAFT`,
`IN_REVIEW → DRAFT`.

### 4.3 Release

```
PLANNED → CANDIDATE → VERIFIED → APPROVED → RELEASED       (and RELEASED → ROLLED_BACK)
```

### 4.4 Transition table (guards)

Only these transitions exist. Anything else is rejected as an illegal jump — including "skipping
ahead" to a later state whose prerequisite gate has not produced evidence.

| Scope | From | To | Guard (must hold) |
|---|---|---|---|
| product | UNINITIALIZED | DISCOVERY | gate `activation` PASS and `docs/discovery.md` exists |
| product | DISCOVERY | REQUIREMENTS_BASELINED | `docs/requirements.md` exists |
| product | REQUIREMENTS_BASELINED | PRD_APPROVED | gate `prd-ready` PASS |
| product | PRD_APPROVED | ARCHITECTURE_APPROVED | `docs/architecture.md` exists |
| product | ARCHITECTURE_APPROVED | ACTIVE | at least one story exists |
| story | DRAFT | IN_REVIEW | — |
| story | IN_REVIEW | READY_FOR_DEV | gate `story-ready` PASS (per change-type policy) |
| story | READY_FOR_DEV | IN_DEVELOPMENT | — |
| story | IN_DEVELOPMENT | READY_FOR_TEST | — |
| story | READY_FOR_TEST | VERIFIED | gate `verified` PASS |
| story | VERIFIED | MERGED | gate `verified` PASS and not STALE |
| story | IN_REVIEW / READY_FOR_DEV | DRAFT | — (rollback) |
| story | READY_FOR_TEST / VERIFIED | IN_DEVELOPMENT | — (rollback) |
| release | PLANNED | CANDIDATE | — |
| release | CANDIDATE | VERIFIED | gate `release-ready` PASS |
| release | VERIFIED | APPROVED | approval event whose approver is not the requester |
| release | APPROVED | RELEASED | evidence bound to the candidate commit |
| release | RELEASED | ROLLED_BACK | — |
| release | CANDIDATE | PLANNED | — (rollback) |

A state is **never** read from a Markdown field. If a story file declares `state:` and the ledger
disagrees, the drift itself is reported as a blocker: hand-edited state is not evidence.

## 5. Gates that are machine-verified in this round

Machine-verifying all of G1–G10 at once would produce shallow checks. Round one covers the four
gates where "green but empty" hurts most, plus local activation.

| Gate id | Blueprint gate | Scope | What is actually verified |
|---|---|---|---|
| `activation` | G0 | product | `.eos/project.json` valid, not the untouched template once code exists, `workflowProfile` resolves, activation ledger present |
| `prd-ready` | G3 | product | `docs/prd.md` exists, acceptance-criteria ids parse and are unique, no unresolved `BLOCKER` marker |
| `story-ready` | G5 | story | story references real PRD ACs, every AC has a test intent, LLM-backed ACs have an eval case, telemetry/authz/rollback tasks present |
| `verified` | G7 | story | product-gate evidence exists and is fresh, every story AC has a passing trace row, evals meet threshold when agentic |
| `release-ready` | G8 | release | required stories VERIFIED, secret scan clean, compliance boundary valid, no expired waivers, runbook + rollback present, evidence bound to the candidate commit |

`eos explain <gate>` prints the full rule set for one gate on demand — that is the only place the
detailed rules need to be read.

### 5.1 Result statuses

| Status | Meaning | Counts as "may promote"? |
|---|---|---|
| `PASS` | every check passed, evidence is fresh | yes |
| `FAIL` | at least one check failed | no |
| `BLOCKED` | a prerequisite is missing (tool not installed, prior gate absent) | no |
| `PENDING` | the gate applies but has never been run | no |
| `WAIVED` | an unexpired, approved waiver covers it | yes (recorded) |
| `NOT_APPLICABLE` | the change-type policy says this gate does not apply | yes (recorded) |
| `STALE` | a previous PASS whose inputs or definitions changed | no |
| `ERROR` | the evaluator itself could not run | no |

A missing tool, a crashed validator, an unreadable file or "there are no tests" is **never** mapped
to `PASS`. That rule is the whole reason this layer exists.

### 5.2 Evidence binding and staleness

Every gate run writes `.eos/evidence/<gate>__<scopeType>__<scopeId>.json` binding:
commit SHA · gate-definition version · evaluator version · SHA-256 of every input file ·
the real commands executed with their exit codes · each individual check result · generation time.

Evidence becomes `STALE` automatically when any input hash changes, when an input disappears, when
the gate definition version changes, or when `.eos/gates.json` / `.eos/workflow.json` change — the
governance-change rule. Release verification additionally requires the evidence commit to equal the
candidate commit.

## 6. Change types (branch the flow without unknown paths)

`PRODUCT_BASELINE` · `FEATURE` · `BUGFIX` · `SPIKE` · `HOTFIX` · `DOC_ONLY` · `GOVERNANCE` ·
`RELEASE`. The policy lives in `.eos/workflow.json` and is data, not code:

| Change type | `prd-ready` | `story-ready` | `verified` | `release-ready` |
|---|---|---|---|---|
| PRODUCT_BASELINE | required | not applicable | not applicable | not applicable |
| FEATURE | required | required | required | not applicable |
| BUGFIX | not applicable | required | required | not applicable |
| SPIKE | not applicable | not applicable | not applicable | not applicable |
| HOTFIX | not applicable | waivable | required | not applicable |
| DOC_ONLY | not applicable | not applicable | not applicable | not applicable |
| GOVERNANCE | not applicable | not applicable | not applicable | not applicable |
| RELEASE | not applicable | not applicable | not applicable | required |

`not applicable` is a *decision recorded in the ledger*, not a silent skip — and a classification
that switches gates off cannot simply be asserted. Two rules stop relabelling from becoming a
one-line bypass of everything above: a change type may declare `mergeable: false` (a SPIKE explores
freely but can never reach `MERGED` — ship it as a FEATURE or BUGFIX instead), and a change type
that turns verification off (`SPIKE`, `DOC_ONLY`, `GOVERNANCE`) requires a
`classificationReason` in the story front matter before it may leave `DRAFT`. An undeclared change
type is refused outright rather than defaulted into freedom.

### 6.1 Waivers

A waiver is a file in `.eos/waivers/` with `gate`, `scope`, `reason`, `riskOwner`, `approver`,
`expiresOn` (or a trigger) and `compensatingControls`. It is rejected when the approver equals the
requester, when it has expired, or when the gate policy marks the gate non-waivable. EOS can
*suggest* a waiver; it never approves one.

## 7. Next-Best-Action JSON contract

`eos next --json` and `eos resume --json` emit exactly this shape (`schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "repo": { "commit": "abc1234", "root": "/path/to/repo" },
  "current": { "scopeType": "story", "scopeId": "STORY-012", "state": "DRAFT", "changeType": "FEATURE" },
  "recommendedAction": {
    "id": "design-acceptance-tests",
    "title": "Design the missing acceptance tests",
    "reason": "AC3.2 has no acceptance-test intent",
    "targetGate": "story-ready",
    "copilotAgent": "eos-plan",
    "prompt": "Create the missing ATDD intent for AC3.2 only.",
    "skills": ["bmad-testarch-atdd"],
    "command": "node .github/eos/eos.mjs check --gate story-ready --scope STORY-012",
    "doneWhen": ["AC3.2 references a test intent", "story-ready check passes"]
  },
  "alternatives": [],
  "blockers": [
    { "gate": "story-ready", "check": "ac-test-intent", "status": "FAIL", "detail": "AC3.2 has no test intent" }
  ],
  "exitCode": 2
}
```

`recommendedAction` is never null: when nothing is blocked, the action is the next forward step
(for example `start-next-change`). The router is deterministic code — the same repository state
always produces the same action, and an LLM is never asked to guess the phase.

## 8. Agent & skill mapping contract

`.eos/agent-map.json` maps an **action id** to at most one primary Copilot agent (or one prompt) and
a minimal BMAD skill chain. Developers never choose from the 73 installed skills.

```json
{
  "schemaVersion": 1,
  "actions": {
    "design-acceptance-tests": {
      "agent": "eos-plan",
      "prompt": null,
      "skills": ["bmad-testarch-atdd"],
      "handoff": "Create the missing ATDD intent for the listed AC only."
    }
  }
}
```

Rules: one action → one primary agent; the skill list stays minimal; a referenced agent file or
prompt file that does not exist makes the action `BLOCKED` with an install/alternative path
(`eos doctor` reports it) instead of silently recommending something unusable. The human-readable
projection of this map is [agent-map.md](agent-map.md); the JSON is what the router reads.

## 9. Handoff context package

`eos handoff --scope story --id STORY-012` writes `.eos/handoffs/STORY-012.json`: scope + state,
the goal, the relevant PRD ACs, approved decisions, the file list with hashes, current blockers,
explicit non-goals, the recommended agent/prompt/skills, `doneWhen`, and the command to return
through. It never contains the whole repository, credentials, unrelated history, unapproved
speculation or production data.

It is a **cache**, not authority: `eos handoff --verify` re-checks the bound commit and input hashes
and reports `STALE` rather than letting an agent act on a stale package.

## 10. CLI contract

```
node .github/eos/eos.mjs <command> [flags]

  status [--changed]        where the project and the active scope are
  next [--why] [--all]      the single recommended next action
  resume                    restore the local focus in a new session
  check --gate <id> [--scope <id>]      run one gate, write evidence
  transition --scope <type> --id <id> --to <STATE>
  explain <gate>            the full rule set for one gate
  release-status            aggregate release readiness
  verify-release --release <tag>        candidate-bound verification
  waive --gate <id> --scope <id> ...    draft a waiver (never approves)
  handoff --scope <type> --id <id> [--verify]
  ledger [--verify] [--against <ref>]   append-only chain verification
  init [--write]            report/create local, non-destructive integration files
  doctor                    is EOS itself wired correctly?

  global: --json  --why  --all  --no-color
```

Default (human) output is always these six blocks and nothing else:

```
EOS · STORY-012

Current
  IN_REVIEW · FEATURE

Blockers
  story-ready/ac-test-intent — AC3.2 has no test intent

Recommended next
  Design the missing acceptance tests

Why
  story-ready is REQUIRED for a FEATURE and one acceptance criterion has no test intent.

Start
  Copilot agent: eos-plan · skills: bmad-testarch-atdd
  node .github/eos/eos.mjs check --gate story-ready --scope STORY-012

Done when
  AC3.2 references a test intent
  story-ready check passes
```

### 10.1 Exit codes

| Code | Meaning | Emitted by |
|---|---|---|
| 0 | PASS / nothing blocking | any command |
| 1 | FAIL — a check failed, or a transition was rejected | `check`, `transition`, `verify-release` |
| 2 | BLOCKED / PENDING / STALE — action required first | `next`, `resume`, `check`, `release-status` |
| 3 | ERROR — EOS could not evaluate (bad config, crashed evaluator) | any command |

`next` and `resume` deliberately exit 2 while a blocker exists, so a script or a task can tell
"there is work to unblock" from "you are clear to proceed" without parsing text.

## 11. Honest capability boundary (VS Code + Copilot)

There is **no supported public API** to force VS Code / GitHub Copilot Chat to switch the active
custom agent from a terminal command. EOS therefore degrades in this order, and never pretends:

1. a Copilot **handoff** button declared in the current agent's frontmatter;
2. the `eos-guide` agent offering the handoff inside the conversation;
3. printing the target agent name plus a ready-to-paste prompt;
4. printing one copy-paste terminal command that does the same work.

EOS does not use undocumented internal APIs, does not modify a VS Code installation, and does not
simulate GUI clicks. Hooks stay advisory (a Preview feature): the CLI and CI verify everything even
when hooks never fire.

## 12. Relationship to the existing gates and validators

The guided workflow **wraps** the existing validators rather than replacing them —
`validate-config.mjs`, `check-doc-parity.mjs`, `eos-doctor.mjs`, `secret-scan.mjs`, `spec-align.mjs`
and `project-gate.mjs` all keep their current contracts and remain the merge authority in CI. The
new layer adds state, evidence and navigation on top:

- the phase table in `/eos-help` is now a *projection* of `eos status`, not a second source of truth;
- the 10-phase flow (G1–G10) in [blueprint.md](blueprint.md) still describes the method; the five
  machine gates above are the subset that is now mechanically enforced per scope;
- existing repositories keep working with no `.eos/workflow.json`: the CLI reports `PENDING`
  activation and tells you the one command that creates the missing files.
