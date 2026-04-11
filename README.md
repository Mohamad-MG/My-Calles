# MyCalls Operational Dashboard

Internal dashboard plus lightweight shared backend for running the MyCalls revenue workflow:
- Executive Focus
- Sector & Offer Board
- Pipeline Board
- Opportunity Board
- Bottleneck & Performance Board

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

This project is no longer a GitHub Pages-only static site. It now requires the Node server so the dashboard can use shared state and audit logging.

## Supported Runtime Environments

- Supported: the bundled Node server at `http://localhost:4173`
- Unsupported: direct `file://.../index.html`
