# Scanner vNext Rollback Guide

This branch keeps the legacy scanner intact while vNext runs in shadow mode.

## Current Safe Branch

```bash
git branch --show-current
```

Expected branch:

```text
repair/scanner-vnext
```

## Return To Main

```bash
git switch main
git pull origin main
```

## Delete The Repair Branch Locally

Only do this after you no longer need the repair branch:

```bash
git branch -D repair/scanner-vnext
```

## Delete The Remote Repair Branch

Only do this if the branch was pushed and you want it removed from GitHub:

```bash
git push origin --delete repair/scanner-vnext
```

## Keep Legacy Scoring Primary

Legacy scoring is still primary unless this environment variable is enabled:

```bash
SCORING_VNEXT_PRIMARY=false npm run scan:debug100
```

## Test vNext As Primary

Use this only after comparing the shadow report:

```bash
SCORING_VNEXT_PRIMARY=true npm run scan:debug100
```

## Compare Reports

```bash
npm run scanner:vnext
open reports/report.html
```

## Safety Notes

- `legacyScore` and `legacyRank` remain available on every project.
- `vNextScore` and `vNextRank` run beside legacy scoring.
- Hard-blocked projects cannot appear in vNext buy-oriented rankings.
- Low evidence coverage reduces confidence instead of disappearing from the denominator.
- This project produces research signals only, not financial advice or guaranteed returns.
