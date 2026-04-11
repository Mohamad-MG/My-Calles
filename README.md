# MyCalls Operational Dashboard

Source-first admin dashboard plus lightweight shared backend for running the MyCalls workflow as one shared operational board.

Current release candidate UX:
- Source tabs as the primary navigation
- Extraction panel for quick lead capture inside the active source
- Inbox workflow grouped by source-first stages
- Progression rail that keeps lead-to-opportunity continuity visible
- Shared persistent state, audit logging, and validation observability

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
- Shared persistent dashboard state
- Audit logging for every mutation
- Lightweight observability for validation

State is stored under `data/` and is shared across sessions.

## Source-First Workflow

The dashboard is now designed for a single `Admin` operator.

Each source tab is a complete execution surface:
- Capture a new lead directly into the active source
- Manage the lead inside source inbox buckets
- Move ready leads into opportunities without leaving the same source context

Display-level inbox buckets:
- `New`
- `Needs Extraction`
- `Needs Reply`
- `Needs Qualification`
- `Ready for Handoff`
- `Closed / Disqualified`

Business rules preserved in this release candidate:
- No automatic sector activation
- No duplicate opportunity from the same `origin_lead_id`
- Funnel logic remains truthful and avoids misleading aggregation

## API Surface

- `GET /state`
- `PATCH /:entity/:id`
- `POST /sectors`
- `POST /leads`
- `POST /opportunities`
- `POST /state/restore-seed`
- `POST /state/reset-shared`
- `GET /debug/observability`

## Validation Mode

For real-world usage validation, the system now monitors:
- Shared state sync across sessions
- Last-write-wins conflicts
- API latency and failures
- Audit trail completeness for each mutation

Optional lightweight debug visibility:
- Open the dashboard with `?debug` to see validation logs in the browser console
- Check `GET /debug/observability` for a simple runtime summary

## Why `file://` Is Unsupported

The dashboard boots through ES modules and now depends on the shared backend API. Modern browsers block module loading from `file://`, and the API is unavailable there, so the app intentionally shows a support/fallback message in that mode.

## Deployment Note

This project is no longer a GitHub Pages-only static site. It requires the Node server so the dashboard can use shared state, audit logging, and validation observability.

Deploy through GitHub Actions only by pushing `main`.

## Supported Runtime Environments

- Supported: the bundled Node server at `http://localhost:4173`
- Unsupported: direct `file://.../index.html`
