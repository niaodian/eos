# ADR-018 — EOS is an MCP server for what an agent may do alone: read state and run gates

- Status: Accepted
- Date: 2026-10-03
- Depends on: ADR-005 (Core reaches every verdict offline), ADR-014 (the trust chain: what needs a
  person), ADR-017 (the CLI is the one interface every platform's skills call)
- Governs: `eos mcp`, `.github/eos/lib/mcp.mjs`, the MCP configuration `eos agents sync` generates

## Context

Every mainstream coding agent can run `node .github/eos/eos.mjs next`, so the CLI already is the
universal interface. What it costs an agent is a terminal approval per command and parsing text or
`--json` output itself. Every Tier-1 platform (Copilot, Claude Code, Codex, Cursor, Antigravity,
Gemini CLI) also speaks the Model Context Protocol over stdio, where tools come with input schemas and
return structured results.

An MCP server is also a new way in. Once a client trusts a server, it may call any of its tools without
asking again, and some clients auto-approve tools they consider read-only. A server that exposed the
whole CLI would make `approve`, `waive`, `transition` or `policy lock --write` one tool call away from
a model — exactly the decisions ADR-014 reserves for a person.

Options considered:

1. **No MCP; the CLI only.** Nothing to maintain, but every Tier-1 platform loses structured results
   and pays a terminal prompt per step.
2. **Every command as a tool, guarded by MCP annotations.** Annotations are hints to the client, not
   enforcement, and auto-approval policies differ per client.
3. **A tool set limited to reading state and producing machine evidence**, with each tool a thin
   wrapper over the CLI.

## Decision

**Option 3.**

1. **Tools read state or run gates; nothing that needs a person's authority is a tool.** The tools are
   `eos_next`, `eos_status`, `eos_resume`, `eos_health`, `eos_explain`, `eos_check`, `eos_verify`,
   `eos_release_status`, `eos_stage_skeleton` (prints, never writes), `eos_product_tree`, `eos_doctor`
   and `eos_policy_check`. Every other CLI command is listed with the reason it is not a tool —
   approving, waiving, transitioning, choosing the focus, release keys and signatures, the ledger, and
   everything that rewrites governance files — and a test holds that list against the command
   registry, so a new command cannot become reachable, or silently unreachable, by accident.
2. **One engine.** Each call runs the CLI with `--json` in a fresh process, no shell, and returns its
   verdict unchanged: the JSON as `structuredContent` and as text, plus the exit code and its name. A
   gate that FAILs is an answer (`isError: false`); only EOS being unable to answer is a tool error.
3. **Arguments are validated before anything runs**: closed schemas, ids that cannot start with `-`
   (so no argument becomes a flag such as `--write`), and no inherited property names.
4. **Calls run one at a time**, in arrival order, so two gates never append to the ledger at once.
   Closing stdin means "no more questions": what was asked is answered, then the server exits.
   SIGTERM, SIGINT or a broken stdout means "stop now": the running CLI process is killed, not
   orphaned.
5. **Both protocol eras.** A client that opens with `initialize` (revisions up to 2025-11-25) gets
   that handshake; a request carrying `_meta["io.modelcontextprotocol/protocolVersion"]` (2026-07-28)
   is served statelessly; `server/discover` answers both, and an unsupported version is refused with
   the supported list (-32022).
6. **Zero dependencies and offline.** Newline-delimited JSON-RPC on stdio, Node's standard library
   only; the offline-boundary test covers the server like the rest of Core.
7. **Trust stays with each platform.** The generated client configuration declares the server and
   nothing more: no auto-approve list, no pre-granted trust. Each platform's first-use confirmation
   is kept.

## Consequences

- An agent gets structured results and one fewer terminal approval per step, while the CLI remains the
  interface every platform can fall back to; MCP is an enhancement, not a prerequisite.
- A state change still happens only through the CLI a developer runs. An agent that wants one says
  which command to run; the server's instructions tell it so.
- `eos_check` and `eos_verify` run the project's tests. A long run may exceed a client's own tool
  timeout; the CLI is the fallback, and the server ends a run after 15 minutes.
- The tool list is a published contract: adding a tool means deciding, in this ADR's terms, that it
  needs no one's authority.
