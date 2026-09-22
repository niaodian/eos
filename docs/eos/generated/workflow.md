<!-- GENERATED FILE — DO NOT EDIT.
     Source of truth: .eos/workflow.json
     Regenerate:      node .github/eos/eos.mjs docs --write
     CI check:        node .github/eos/eos.mjs docs --check

     Editing this file by hand is pointless: the next --write overwrites it, and --check fails
     the build in the meantime. Change the policy instead; the prose follows. -->

# Workflow

Profiles: `standard-product` · `prototype` · `controlled` · `regulated`. Default: `standard-product`.

## State machines

### `product`

```mermaid
stateDiagram-v2
  [*] --> UNINITIALIZED
  UNINITIALIZED --> DISCOVERY : discovery-ready
  DISCOVERY --> REQUIREMENTS_BASELINED : requirements-ready
  REQUIREMENTS_BASELINED --> PRD_BASELINED : prd-ready
  PRD_BASELINED --> UX_BASELINED : ux-ready
  UX_BASELINED --> ARCHITECTURE_BASELINED : architecture-ready
  ARCHITECTURE_BASELINED --> ACTIVE
```

### `story`

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> IN_REVIEW
  IN_REVIEW --> READY_FOR_DEV : story-ready
  READY_FOR_DEV --> IN_DEVELOPMENT
  IN_DEVELOPMENT --> READY_FOR_TEST
  READY_FOR_TEST --> VERIFIED : verified
  VERIFIED --> MERGED : verified
  IN_REVIEW --> DRAFT
  READY_FOR_DEV --> DRAFT
  READY_FOR_TEST --> IN_DEVELOPMENT
  VERIFIED --> IN_DEVELOPMENT
```

### `release`

```mermaid
stateDiagram-v2
  [*] --> PLANNED
  PLANNED --> CANDIDATE
  CANDIDATE --> VERIFIED : release-ready
  VERIFIED --> APPROVED
  APPROVED --> RELEASED : release-ready
  RELEASED --> OBSERVED : telemetry-ready
  OBSERVED --> ITERATED : iteration-ready
  RELEASED --> ROLLED_BACK
  OBSERVED --> ROLLED_BACK
  ROLLED_BACK --> ITERATED : iteration-ready
  CANDIDATE --> PLANNED
  VERIFIED --> CANDIDATE
```

## Gate policy by profile and change type

Each cell is what the profile requires of that gate for that kind of change. `required` must pass, `waivable` can be lifted by an approved unexpired waiver, `not_applicable` is recorded as a decision rather than skipped.

### `standard-product`

Full SDLC profile: a product baseline plus per-story feature work, with release verification.

| Change type | `activation` | `discovery-ready` | `requirements-ready` | `prd-ready` | `ux-ready` | `architecture-ready` | `story-ready` | `verified` | `release-ready` | `telemetry-ready` | `iteration-ready` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PRODUCT_BASELINE` | **required** | **required** | **required** | **required** | **required** | **required** | – | – | – | – | – |
| `FEATURE` | **required** | – | – | **required** | – | – | **required** | **required** | – | – | – |
| `BUGFIX` | **required** | – | – | – | – | – | **required** | **required** | – | – | – |
| `SPIKE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `HOTFIX` | **required** | – | – | – | – | – | waivable | **required** | – | – | – |
| `DOC_ONLY` | – | – | – | – | – | – | – | – | – | – | – |
| `GOVERNANCE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `RELEASE` | **required** | – | – | – | – | – | – | – | **required** | **required** | **required** |

### `prototype`

Exploration-only profile: nothing is gated except local activation. Never use it for a product that ships.

| Change type | `activation` | `discovery-ready` | `requirements-ready` | `prd-ready` | `ux-ready` | `architecture-ready` | `story-ready` | `verified` | `release-ready` | `telemetry-ready` | `iteration-ready` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `SPIKE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `DOC_ONLY` | – | – | – | – | – | – | – | – | – | – | – |

### `controlled`

Enterprise and business-critical systems. Everything Standard requires, plus: no gate may be waived, release verification applies to hotfixes too, and telemetry must be planned before a release is considered done. Use when an outage has customers, money or a regulator attached.

| Change type | `activation` | `discovery-ready` | `requirements-ready` | `prd-ready` | `ux-ready` | `architecture-ready` | `story-ready` | `verified` | `release-ready` | `telemetry-ready` | `iteration-ready` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PRODUCT_BASELINE` | **required** | **required** | **required** | **required** | **required** | **required** | – | – | – | – | – |
| `FEATURE` | **required** | – | – | **required** | – | – | **required** | **required** | – | – | – |
| `BUGFIX` | **required** | – | – | – | – | – | **required** | **required** | – | – | – |
| `SPIKE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `HOTFIX` | **required** | – | – | – | – | – | **required** | **required** | **required** | – | – |
| `DOC_ONLY` | – | – | – | – | – | – | – | – | – | – | – |
| `GOVERNANCE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `RELEASE` | **required** | – | – | – | – | – | – | – | **required** | **required** | **required** |

### `regulated`

Compliance and audit-sensitive systems (HIPAA / PCI-DSS / SOC2 / SOX / GDPR and friends). Everything Controlled requires, plus: every change is classified with a recorded reason, a spike may not be merged, the iteration write-back is required so the loop is closed in the record, and DOC_ONLY no longer switches the activation gate off — in an audited environment "it was only documentation" is a claim that still has to be verifiable.

| Change type | `activation` | `discovery-ready` | `requirements-ready` | `prd-ready` | `ux-ready` | `architecture-ready` | `story-ready` | `verified` | `release-ready` | `telemetry-ready` | `iteration-ready` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PRODUCT_BASELINE` | **required** | **required** | **required** | **required** | **required** | **required** | – | – | – | – | – |
| `FEATURE` | **required** | – | – | **required** | – | – | **required** | **required** | – | – | – |
| `BUGFIX` | **required** | – | – | – | – | – | **required** | **required** | – | – | – |
| `SPIKE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `HOTFIX` | **required** | – | – | – | – | – | **required** | **required** | **required** | – | – |
| `DOC_ONLY` | **required** | – | – | – | – | – | – | – | – | – | – |
| `GOVERNANCE` | **required** | – | – | – | – | – | – | – | – | – | – |
| `RELEASE` | **required** | – | – | – | – | – | – | – | **required** | **required** | **required** |
