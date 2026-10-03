# api/

Your API contracts — `api/openapi.yaml` for a REST service. The contract is designed at the
architecture stage (G4), before any handler exists, and the code follows it.

- **Write it at architecture.** The `eos-architecture` agent (or the `bmad-architecture` skill)
  produces it with the data model; `docs/architecture.json` records the API decision that G4 checks.
- **Version it and test against it.** Use a `/v1/` path prefix, and give every endpoint a contract
  test that the trace matrix (`docs/trace-matrix.md`) names, so `verified` (G7) runs it.
- **Lint it if you like:** `spectral lint api/openapi.yaml` (optional; not part of EOS).

The conventions are in `.github/instructions/data-api/20-data-api.instructions.md`. That rule
applies to `.sql` and `.prisma` files; to apply rules to `api/**` automatically, add a sibling
instruction file with `applyTo: "api/**"`.

`eos upgrade` never touches this folder. Delete this file whenever you like.
