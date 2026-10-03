// activation (G0) — EOS is locally activated.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectStacks } from '../../../hooks/lib/project-config.mjs';
import { ARTIFACTS } from '../state.mjs';
import { ok, fail, blocked } from '../gate-primitives.mjs';

export const evaluators = {
  projectDeclaration(ctx) {
    if (!ctx.snapshot.projectPresent) return fail('.eos/project.json does not exist — EOS cannot tell what this project is or how it is verified');
    if (ctx.snapshot.projectErrors.length) return fail(ctx.snapshot.projectErrors.join(' · '));
    // A copy of the template inherits EOS's own declaration, whose test command is EOS's own suite.
    // Green on that would be EOS verifying itself inside someone else's repository.
    if (ctx.snapshot.project?.templateDefault === true) {
      return fail('.eos/project.json is still the EOS template\'s own declaration — it describes EOS, not your project. Run `node .github/eos/eos.mjs init` to choose a governance track and a starter pack.');
    }
    return ok(`declared ${ctx.snapshot.project.projectType}${ctx.snapshot.project.stacks.length ? ` · ${ctx.snapshot.project.stacks.join(', ')}` : ''}`);
  },
  declarationMatchesRepo(ctx) {
    const p = ctx.snapshot.project;
    if (!p) return blocked('the declaration could not be read');
    const detected = detectStacks(ctx.root);
    if (p.projectType === 'config-only' && detected.length) {
      return fail(`.eos/project.json still declares "config-only" but ${detected.join(', ')} manifest(s) exist — declare the stack with \`node .github/eos/eos.mjs init <pack> --write\` (your track carries over) so the quality gate actually runs`);
    }
    const undeclared = detected.filter((s) => !p.stacks.includes(s));
    if (p.projectType !== 'config-only' && undeclared.length) {
      return fail(`stack manifest(s) found but not declared in "stacks": ${undeclared.join(', ')} — their tests would never run`);
    }
    return ok(detected.length ? `declaration matches the detected stack(s): ${detected.join(', ')}` : 'no product stack detected yet');
  },
  workflowProfileResolves(ctx) {
    if (!ctx.snapshot.workflow) return blocked('.eos/workflow.json could not be loaded');
    if (!ctx.snapshot.profile) return fail(`workflowProfile "${ctx.snapshot.profileName}" is not defined in .eos/workflow.json`);
    return ok(`profile "${ctx.snapshot.profileName}"`);
  },
  activationLedger(ctx) {
    if (!ctx.snapshot.artifacts.activation) return fail('docs/eos/activation.md is missing — the one-time hardening items are untracked');
    const text = readFileSync(join(ctx.root, ARTIFACTS.activation), 'utf8');
    const pending = (text.match(/^\s*-\s*\[ \]/gm) || []).length;
    return pending ? ok(`${pending} hardening item(s) still pending (advisory — server-side protection cannot be verified locally)`) : ok('all hardening items are marked done or waived');
  },
};
