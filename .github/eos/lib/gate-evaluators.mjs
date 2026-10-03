// The gate rules — one evaluator per check in .eos/gates.json, one module per gate.
//
// Every evaluator has the same shape: `(ctx) => { status, detail, artifact? }`, where ctx carries
// the repository root, the snapshot, the scope, the story (when there is one), the change type, and
// a place to record the commands that were actually executed. That uniformity is the GateContract:
// a check is a pure-ish function of project state, and the engine in gates.mjs neither knows nor
// cares which one it is calling.
//
// Each gate's evaluators live in evaluators/<gate id>.mjs, and this registry collects them. Adding a
// gate means adding an entry to .eos/gates.json naming its evaluators, a module implementing them,
// and one line below. Nothing else changes — which is the property that makes the registry worth
// having. A name two modules define fails at load: a lookup by name must not depend on import order.
import { evaluators as activation } from './evaluators/activation.mjs';
import { evaluators as discoveryReady } from './evaluators/discovery-ready.mjs';
import { evaluators as requirementsReady } from './evaluators/requirements-ready.mjs';
import { evaluators as prdReady } from './evaluators/prd-ready.mjs';
import { evaluators as uxReady } from './evaluators/ux-ready.mjs';
import { evaluators as architectureReady } from './evaluators/architecture-ready.mjs';
import { evaluators as storyReady } from './evaluators/story-ready.mjs';
import { evaluators as verified } from './evaluators/verified.mjs';
import { evaluators as releaseReady } from './evaluators/release-ready.mjs';
import { evaluators as telemetryReady } from './evaluators/telemetry-ready.mjs';
import { evaluators as iterationReady } from './evaluators/iteration-ready.mjs';

/** Each gate's evaluators, by the gate's id in .eos/gates.json. */
export const EVALUATORS_BY_GATE = Object.freeze({
  activation,
  'discovery-ready': discoveryReady,
  'requirements-ready': requirementsReady,
  'prd-ready': prdReady,
  'ux-ready': uxReady,
  'architecture-ready': architectureReady,
  'story-ready': storyReady,
  verified,
  'release-ready': releaseReady,
  'telemetry-ready': telemetryReady,
  'iteration-ready': iterationReady,
});

/** Every evaluator, by the name a check in .eos/gates.json refers to it with. */
export const evaluators = {};
const definedBy = {};
for (const [gate, own] of Object.entries(EVALUATORS_BY_GATE)) {
  for (const [name, fn] of Object.entries(own)) {
    if (definedBy[name]) throw new Error(`evaluator "${name}" is defined by both ${definedBy[name]} and ${gate}`);
    definedBy[name] = gate;
    evaluators[name] = fn;
  }
}
