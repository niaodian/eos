# src/

Your product's code. The template ships this folder empty on purpose: the stack is chosen at the
architecture stage (G4), and code arrives one story at a time.

- **How code lands.** A story passes `story-ready` (G5), is implemented (`bmad-dev-story`) and
  reviewed (G6), and is proven by its tests at `verified` (G7). `node .github/eos/eos.mjs next` names
  each step.
- **Declare the stack once code exists.** `node .github/eos/eos.mjs init <pack> --write` sets
  `projectType` and `commands` in `.eos/project.json`, so the quality gate runs your tests. Until then
  the project is `config-only`, and no product code is verified.
- **Organise it the way your stack expects.** EOS reads no file here by name; the scoped rules in
  `.github/instructions/` apply by file type.
- **Everything here is part of the product tree** a verification is bound to: changing a file makes
  the recorded test evidence stale until the gate runs again.

`eos upgrade` never touches `src/`, `api/` or `ops/`. Delete this file whenever you like.
