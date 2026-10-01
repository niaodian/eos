#!/usr/bin/env node
// EOS — the guided-workflow CLI. Zero external deps, offline, cross-platform.
//
//   node .github/eos/eos.mjs next        # the single recommended next action
//   node .github/eos/eos.mjs resume      # restore this machine's focus in a new session
//   node .github/eos/eos.mjs check --gate story-ready --scope STORY-012
//   node .github/eos/eos.mjs transition --scope story --id STORY-012 --to READY_FOR_DEV
//
// Exit codes (contract — see docs/eos/developer-experience.md §10.1):
//   0 PASS / nothing blocking · 1 FAIL or rejected transition · 2 BLOCKED/PENDING/STALE · 3 ERROR
//
// Layout: this file parses arguments and applies the preconditions every command shares (files from
// a newer EOS, a configuration that cannot be evaluated). The handlers live in ./commands/, one
// module per domain, and ./commands/index.mjs is the registry that maps a command name to one.
import { readSnapshot } from './lib/state.mjs';
import { compatibilityErrors } from './lib/migrate.mjs';
import { exitAfterFlush } from './lib/exit.mjs';
import { EXIT } from './commands/shared.mjs';
import { commands } from './commands/index.mjs';

const USAGE = `EOS guided workflow

usage: node .github/eos/eos.mjs <command> [flags]

  status [--changed]                      where the project and the active scope are
  next [--why] [--all]                    the single recommended next action
  resume                                  restore the local focus in a new session
  check --gate <id> [--scope <id>]        run one gate and record evidence
  verify [--full] [--plan]                run the gates this change can have affected
  transition --scope <type> --id <id> --to <STATE>
  approve --scope <type> --id <id>        record an approval (a second person, never the requester)
  explain <gate>                          the full rule set for one gate
  release init|bind|list [--release <id>]  scaffold / re-bind (artifacts, SBOM, ledger) / list manifests
  release keygen [--out <file>] [--write]   the Ed25519 key release manifests are signed with
  release sign|verify --release <id>      sign a manifest (--key <file>) / verify it (--provenance <file>)
  providers                               what external authorities this project consults
  release-status                          aggregate release readiness
  verify-release --release <id>           candidate-bound release verification
  product-tree                            the identity of the tree a verification applies to
  waive --gate <id> --scope <id> --reason <text> --risk-owner <who> --expires <YYYY-MM-DD> --control <text>
  handoff --scope <type> --id <id> [--verify]
  ledger [--verify] [--against <ref>] [--resolve [--write]]
  focus --scope <type> --id <id>          set this machine's local focus (no authority)
  init [<pack>] [--track standard|regulated] [--write] [--force]
                                          declare the project, choose its governance track, create local files
  stack sync [--write]                    render the always-on workspace rule from .eos/project.json
  new <pack> [--track …] [--write]        the pack half of init (the declaration only)
  sbom [--write] [--check]                software bill of materials, bound to the tree
  policy [diff|lock|check] [--against <ref>] [--write] [--reason <text>]
                                          no gate gets weaker without a reason and a second person
  policy export --name <org> --version <v> [--sign --key <file>] [--out <file>] | policy sync [--check]
                                          publish an organisation baseline / vendor it (the only networked command)
  migrate [--apply]                       governance file versions; plan first, then apply
  docs [--write] [--check]                regenerate the docs that restate the policy
  health                                  blockers, stale evidence, waivers, trend — one screen
  report [--format json|markdown] [--out <file>] [--org <report.json>…]
                                          governance report for one repository, or many aggregated
  doctor                                  is EOS itself wired correctly?

  global: --json  --why  --all  --no-color
`;

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { flags._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { (flags[key] = flags[key] === undefined ? next : [].concat(flags[key], next)); i++; }
  }
  return flags;
}

// --------------------------------------------------------------------------------- entry
async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const command = flags._[0];
  if (!command || flags.help || command === 'help') { console.log(USAGE); return command ? EXIT.OK : EXIT.ERROR; }
  const fn = commands[command];
  if (!fn) { console.log(`unknown command "${command}"\n\n${USAGE}`); return EXIT.ERROR; }

  let snapshot;
  try {
    snapshot = readSnapshot(process.cwd());
  } catch (e) {
    console.log(`EOS ERROR — the project state could not be read: ${e.message}`);
    return EXIT.ERROR;
  }
  // A broken EOS configuration is an ERROR for every command except the ones whose job is to
  // report or repair it. It is never downgraded into a pass.
  // A file written by a NEWER EOS must stop every command except the ones that diagnose it. The
  // schema validator would otherwise reject its unknown properties and report a symptom instead of
  // the cause, sending people to edit a file whose format they are not the authority on.
  const ahead = compatibilityErrors(process.cwd());
  if (ahead.length && !['migrate', 'doctor'].includes(command)) {
    console.log(['EOS ERROR — this repository was written by a newer version of EOS:', '',
      ...ahead.map((e) => `  ERROR ${e}`), '',
      '  Upgrade EOS, or run `node .github/eos/eos.mjs migrate` to see the version gap.', ''].join('\n'));
    return EXIT.ERROR;
  }
  if (snapshot.errors.length && !['doctor', 'init', 'next', 'resume', 'status', 'ledger', 'migrate'].includes(command)) {
    console.log(['EOS ERROR — the configuration could not be evaluated:', '', ...snapshot.errors.map((e) => `  ERROR ${e}`), '',
      '  Fix the file(s) above, or run `node .github/eos/eos.mjs doctor`.', ''].join('\n'));
    return EXIT.ERROR;
  }
  try {
    // Some commands consult an external authority and are therefore async. Awaiting uniformly keeps
    // one dispatch path rather than two.
    return await fn(snapshot, flags);
  } catch (e) {
    console.log(`EOS ERROR — ${command} failed: ${e.message}`);
    return EXIT.ERROR;
  }
}

// A plain process.exit() here would cut off output still queued for a pipe (lib/exit.mjs).
exitAfterFlush(await main());
