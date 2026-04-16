# MyCalls V2

Channel-first operating system for daily lead generation and qualification.

Current product shape:
- `Home` as a strict decision screen
- Dedicated workspaces for `WhatsApp`, `LinkedIn`, and `Google`
- `Google` split internally into `Inbound` and `Rank Ops`
- Shared converted handoff queue only for qualified records
- Full-screen downstream opportunity detail
- Separate V2 persistence, audit trail, and observability

## Local Run

This app must run through the shared Node server, not `file://`.

From this folder:

```bash
npm start
```

Then open:

```text
http://localhost:4173/en/v2/
```

The server provides:
- Static V2 pages
- Isolated V2 shared state
- Audit logging for every mutation
- Lightweight observability for validation

State is stored under `data/` and is shared across sessions.

## V2 Route Surface

- `GET /en/v2/`
- `GET /en/v2/whatsapp/`
- `GET /en/v2/linkedin/`
- `GET /en/v2/google/`
- `GET /en/v2/handoff/`
- `GET /en/v2/opportunities/:id/`
- Arabic parity under `/ar/v2/...`

## API Surface

- `GET /v2/state`
- `PATCH /v2/:entity/:id`
- `POST /v2/:entity`
- `POST /v2/conversions/qualified-leads`
- `POST /v2/opportunities`
- `POST /v2/state/restore-seed`
- `GET /v2/debug/observability`

## Core Guarantees

- Each channel owns its own selectors, statuses, transitions, and forms
- No shared generic source workflow engine
- Qualified conversion creates a new `qualified_lead` while preserving source history
- Opportunities can only be created from handoff-ready qualified leads
- Duplicate opportunity creation is blocked
- V1 APIs and V1 frontend are removed

## Why `file://` Is Unsupported

The V2 app boots through ES modules and depends on the shared backend API. Modern browsers block module loading from `file://`, and the API is unavailable there.

## Deployment Note

This project requires the Node server so the dashboard can use shared state, audit logging, and validation observability.

Deploy through GitHub Actions only by pushing `main`.

## Supported Runtime Environments

- Supported: the bundled Node server at `http://localhost:4173/en/v2/`
- Unsupported: direct `file://.../index.html`
