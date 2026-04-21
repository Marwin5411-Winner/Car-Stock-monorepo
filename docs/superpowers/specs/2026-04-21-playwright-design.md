# Playwright Browser Automation — Design Spec

**Date:** 2026-04-21
**Scope:** Critical business flows for VBeyond frontend (React 19 + Vite)
**Status:** Approved

---

## Goals

Cover the browser-side of the same golden path the API E2E test exercises:
login → stock → sale → payments → complete. Catch regressions that the API tests cannot — form validation, navigation, status badge rendering, Thai-language UI elements.

## Non-Goals

- Full coverage of every page and route (~40 routes)
- Mocked API responses
- Visual regression / screenshot diffing

---

## Architecture

### Location

New workspace `apps/e2e/` alongside `apps/api` and `apps/web`. Keeps Playwright dependencies isolated and the workspace independently runnable.

```
apps/e2e/
├── package.json
├── playwright.config.ts
├── global-setup.ts
├── tsconfig.json
└── specs/
    ├── auth.spec.ts
    ├── stock.spec.ts
    ├── sales.spec.ts
    └── payments.spec.ts
```

### Backend Strategy

Tests run against the **live stack**:

| Service | URL |
|---------|-----|
| API | `http://localhost:3001` |
| Web (Vite) | `http://localhost:5173` |

`playwright.config.ts` uses the `webServer` option to auto-start Vite before the suite runs. The API must be running separately (same requirement as the existing API E2E test).

---

## Auth: Global Setup + StorageState

`global-setup.ts` runs once before any spec:

1. Calls `POST /api/auth/login` with admin credentials
2. Opens a blank Playwright page, writes the JWT to `localStorage` under the key `auth_token` (matching what `ApiClient` in `src/lib/api.ts` reads)
3. Saves browser storage to `storageState.json`

All specs declare `storageState: './storageState.json'` — they start already authenticated, no re-login cost.

`storageState.json` is gitignored (generated at runtime).

---

## Test Data Strategy

Each spec's `beforeAll` seeds prerequisites by calling the API directly (the same `fetch`-based helper pattern from the API E2E test). The spec then drives the browser UI to perform the action under test.

This means:
- No shared state between specs — each creates and owns its data
- Unique suffixes (`Date.now()`) prevent collisions across runs
- Teardown is not required — dev DB is disposable

---

## Spec Coverage

### `auth.spec.ts`
| Test | What it checks |
|------|---------------|
| Login with valid credentials | Redirects to `/dashboard`, shows company name |
| Login with wrong password | Stays on login page, shows Thai error message |
| Logout | Clears token, redirects back to login |

### `stock.spec.ts`
| Test | What it checks |
|------|---------------|
| Navigate to stock list | Page renders, table visible |
| Create new stock via form | Fill VIN, model, costs — submit — success toast, redirected to detail |
| Stock detail page | VIN, status badge (AVAILABLE), cost breakdown visible |

### `sales.spec.ts`
| Test | What it checks |
|------|---------------|
| Create direct sale | `beforeAll` seeds stock + customer via API; fill sale form in browser; submit; see sale number |
| Status → PREPARING | Click status button, select PREPARING, badge updates |
| Status → DELIVERED | Same flow, badge updates |

### `payments.spec.ts`
| Test | What it checks |
|------|---------------|
| Record DEPOSIT | `beforeAll` seeds sale (DELIVERED state) via API; navigate to payments; fill form; submit; see payment in list |
| Record full payment | Record remaining amount; payment list shows 2 entries |
| Complete sale | After full payment, status button allows COMPLETED; badge updates to COMPLETED |

---

## Configuration

### `playwright.config.ts` key settings

```ts
{
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    storageState: './storageState.json',
    locale: 'th-TH',          // Thai locale for date/number formatting
  },
  webServer: {
    command: 'bun run dev',
    cwd: '../web',
    url: 'http://localhost:5173',
    reuseExistingServer: true, // won't start a second Vite if already running
  },
  projects: [{ name: 'chromium' }],  // single browser, focused suite
}
```

### Root `package.json` script

```json
"test:e2e": "cd apps/e2e && npx playwright test"
```

### `.gitignore` additions

```
apps/e2e/storageState.json
apps/e2e/test-results/
apps/e2e/playwright-report/
```

---

## Running the Tests

```bash
# Pre-requisite: API must be running
cd apps/api && PORT=3001 bun run dev

# Run all Playwright tests (starts Vite automatically)
bun run test:e2e

# Run a single spec
cd apps/e2e && npx playwright test specs/auth.spec.ts

# Open Playwright UI mode
cd apps/e2e && npx playwright test --ui
```

---

## File Count Summary

| File | Purpose |
|------|---------|
| `apps/e2e/package.json` | Workspace with `@playwright/test` dep |
| `apps/e2e/playwright.config.ts` | Config: baseURL, storageState, webServer, browser |
| `apps/e2e/global-setup.ts` | One-time login, saves storageState.json |
| `apps/e2e/tsconfig.json` | TypeScript config |
| `apps/e2e/specs/auth.spec.ts` | 3 auth tests |
| `apps/e2e/specs/stock.spec.ts` | 3 stock tests |
| `apps/e2e/specs/sales.spec.ts` | 3 sales tests |
| `apps/e2e/specs/payments.spec.ts` | 3 payment + complete tests |
