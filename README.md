# MyCalls

Channel-first operating system for daily lead generation and qualification.

Current product shape:
- `Home` as a strict decision screen
- Dedicated workspaces for `WhatsApp`, `LinkedIn`, and `Google`
- `Google` split internally into `Inbound` and `Rank Ops`
- Shared converted handoff queue only for qualified records
- Full-screen downstream opportunity detail
- Separate persistence, audit trail, and observability

## Local Run

This app must run through the shared Node server, not `file://`.

From this folder:

```bash
npm start
```

Then open:

```text
http://localhost:4173/en/
```

The server provides:
- Static dashboard pages
- Isolated shared state
- Audit logging for every mutation
- Lightweight observability for validation

State is stored under `data/` and is shared across sessions.

## Route Surface

- `GET /en/`
- `GET /en/whatsapp/`
- `GET /en/linkedin/`
- `GET /en/google/`
- `GET /en/handoff/`
- `GET /en/opportunities/:id/`
- Arabic parity under `/ar/...`

## API Surface

- `GET /state`
- `PATCH /:entity/:id`
- `POST /:entity`
- `POST /conversions/qualified-leads`
- `POST /opportunities`
- `POST /state/restore-seed`
- `GET /debug/observability`

## Core Guarantees

- Each channel owns its own selectors, statuses, transitions, and forms
- No shared generic source workflow engine
- Qualified conversion creates a new `qualified_lead` while preserving source history
- Opportunities can only be created from handoff-ready qualified leads
- Duplicate opportunity creation is blocked
- V1 APIs and V1 frontend are removed

## Why `file://` Is Unsupported

The app boots through ES modules and depends on the shared backend API. Modern browsers block module loading from `file://`, and the API is unavailable there.

## Deployment Note

This project requires the Node server so the dashboard can use shared state, audit logging, and validation observability.

Deploy through GitHub Actions only by pushing `main`.

## Supported Runtime Environments

- Supported: the bundled Node server at `http://localhost:4173/en/`
- Unsupported: direct `file://.../index.html`
