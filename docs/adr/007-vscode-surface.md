# ADR-007 — The VS Code surface stays inside the repository

- Status: Accepted
- Date: 2026-09-21
- Depends on: ADR-005 (external-authority boundary)
- Governs: every proposal to add an EOS Activity Bar, tree view, status-bar item or extension

## Context

The round-4 audit asked for a VS Code Activity Bar: an EOS panel showing the current stage, a
Story / Gate / Evidence tree, freshness and blocking reasons, and one-click fix-and-reverify.

The user value is real. Today the only surfaces are `eos next` in a terminal, the `eos-guide` chat
agent, and five command-palette tasks written by `eos init --write`. A tree view would make state
visible without anyone typing anything.

The cost is not obvious from the feature description, which is why this is an ADR rather than a
backlog item. A VS Code Activity Bar cannot be a file in this repository. It requires:

- a published **extension** with its own `package.json`, activation events and contribution points
- a **bundler**, because an extension ships as compiled JavaScript, not as loose `.mjs` files
- a **marketplace identity**, a release process and a signing key
- **dependencies** — at minimum `@types/vscode` and a build toolchain

Every one of those contradicts a property the repository currently enforces as a test:

- `offline-boundary.test.mjs` asserts EOS Core cannot reach the network and has no dependency that
  could. A build step with a dependency tree is exactly the surface that test exists to refuse.
- `lib/schema.mjs` documents why EOS hand-writes a JSON-Schema subset instead of using AJV: a
  dependency would add a lockfile, an install step and a supply-chain surface *to a tool whose job
  is to police those things*.
- The install story today is "copy the directory". An extension makes it "copy the directory, then
  install a marketplace extension, and keep the two versions in step" — and a stale extension
  reporting confidently about a newer engine is a governance tool lying with a nice icon.

The audit also did not flag the deeper risk: a tree view that reads state **its own way** becomes a
second authority. The single most valuable property EOS has is that one engine decides, and
everything else is a projection of that decision.

## Decision

**EOS ships no VS Code extension. The IDE surface is generated into the repository and rendered by
things VS Code can already display.**

Concretely:

### D1 — Any IDE surface must be a projection, never a source

An IDE view may only display what `eos status --json`, `eos health --json`, `eos next --json` and
`eos check --json` return. It may not read `.eos/` directly, re-derive a state, or cache a verdict.
If a view can disagree with the engine, the view is the bug.

### D2 — The command palette is the supported surface

`eos init --write` writes `.vscode/tasks.json`. Tasks appear in the palette, in the Run Task menu
and can be bound to keys. That covers "run the next thing" and "verify this gate" — the two actions
people actually repeat — with zero install, zero dependencies and zero version skew.

### D3 — Visibility is served by generated Markdown, not by a custom widget

`eos docs --write` generates `docs/eos/generated/` including Mermaid state diagrams and the evidence
graph. VS Code renders Mermaid in its built-in Markdown preview. `eos health` prints the blocker,
staleness, waiver and trend view as text. Neither needs an extension, and both are regenerated from
the policy, so neither can drift.

### D4 — Reopening this needs a new constraint, not a new preference

This decision may be revisited when one of these is true, and not merely because a panel would be
nicer:

- EOS acquires a build step for another reason, so the marginal cost of bundling is near zero; or
- a maintainer commits to the extension's release cadence and version-skew policy in writing; or
- VS Code gains a way to contribute a tree view declaratively from a workspace file, with no
  published extension and no dependencies.

## Consequences

**Accepted:** EOS has no icon in the Activity Bar, and discovery of the tooling depends on the
README, the chat agent and the command palette.

**Preserved:** the install story stays "copy the directory". The zero-dependency and offline claims
stay enforced by tests rather than by intention. There is exactly one authority on project state,
and every surface is visibly derived from it.

**Cheaper than the alternative:** the estimated cost of the extension was the single largest item in
the round-4 backlog. Declining it deliberately — with the conditions under which it would be
reconsidered written down — is worth more than building it and discovering the version-skew problem
afterwards.
