# MyCalls Operational Dashboard

Static internal MVP dashboard for running the MyCalls revenue workflow:
- Executive Focus
- Sector & Offer Board
- Pipeline Board
- Opportunity Board
- Bottleneck & Performance Board

## Local Run

This app must run over HTTP, not `file://`.

From this folder:

```bash
python -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Why `file://` Is Unsupported

The dashboard boots through ES modules. Modern browsers block module loading from `file://` due to origin security rules, so the app intentionally shows a support/fallback message in that mode.

## GitHub Pages Deployment

This project is ready to deploy as a static site from the repository root.

Basic branch deployment:
1. Push this folder contents to the repository root.
2. In GitHub: `Settings -> Pages`.
3. Set `Source` to `Deploy from a branch`.
4. Select your branch and choose `/ (root)`.
5. Save and wait for the Pages URL.

## Supported Runtime Environments

- Supported: GitHub Pages over `https://...`
- Supported: local HTTP servers such as `http://localhost:4173`
- Unsupported: direct `file://.../index.html`
