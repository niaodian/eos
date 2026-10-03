// The command registry: every `eos <command>` and the module that implements it.
//
// eos.mjs owns argument parsing and the fail-closed preconditions every command shares; each handler
// lives with the domain it belongs to. A name registered twice is a programming error and fails loud
// at load time instead of letting the later module silently win.
import { stateCommands } from './state.mjs';
import { gateCommands } from './gates.mjs';
import { releaseCommands } from './release.mjs';
import { ledgerCommands } from './ledger.mjs';
import { maintenanceCommands } from './maintenance.mjs';
import { evidenceCommands } from './evidence.mjs';
import { agentsCommands } from './agents.mjs';
import { stageCommands } from './stage.mjs';
import { mcpCommands } from './mcp.mjs';

const GROUPS = [stateCommands, gateCommands, releaseCommands, ledgerCommands, maintenanceCommands, evidenceCommands, agentsCommands, stageCommands, mcpCommands];
const names = GROUPS.flatMap((group) => Object.keys(group));
const duplicate = names.find((name, i) => names.indexOf(name) !== i);
if (duplicate) throw new Error(`EOS command "${duplicate}" is registered by two command modules`);

/** Null prototype: `eos constructor` or `eos __proto__` is an unknown command, not an inherited method. */
export const commands = Object.freeze(Object.assign(Object.create(null), ...GROUPS));
