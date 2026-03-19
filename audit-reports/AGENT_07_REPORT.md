# AGENT 07 -- Frontend UX, Accessibility & Resilience Audit

**Date:** 2026-03-19
**Scope:** `/apps/web/src/` -- Next.js 14 + Tailwind CSS + shadcn/ui + Mapbox GL
**Methodology:** Static code review of all page components, client components, layout files, and shared UI.

---

## Executive Summary

The app has a solid foundation with server-rendered pages, good use of shadcn/ui, and some error boundaries. However, there are **critical gaps** in loading states, error boundaries, empty states, accessibility, and form validation that would make the app feel broken or unprofessional for paying customers at the R$197-997/month price point.

**Severity scale:** P0 = broken/unusable, P1 = unprofessional, P2 = polish issue

---

## 1. Missing Loading States

| Severity | File | Issue |
|----------|------|-------|
| **P0** | `(dashboard)/company/page.tsx` | Shows raw `"Carregando..."` text with no skeleton or spinner while loading company data. Paying users see an unstyled text flash. |
| **P0** | `(dashboard)/settings/page.tsx` | Same -- raw `"Carregando..."` text with no skeleton/spinner. |
| **P1** | All server-rendered dashboard pages | No `loading.tsx` files exist anywhere in the app. When server components take time (Supabase queries, RPC calls), users see nothing -- the browser appears frozen with no visual feedback. This is especially bad for `/dashboard` (10 parallel Supabase queries), `/map` (paginated loop of up to 10 requests + municipality geocoding), and `/competitors` (multiple queries). |
| **P1** | `(dashboard)/opportunities/[id]/compliance-checker.tsx` | Shows `"Verificando compliance..."` text instead of a proper skeleton. |
| **P1** | `(dashboard)/opportunities/[id]/historical-prices.tsx` | Shows `"Buscando precos historicos..."` text inside a Card while loading. No skeleton. |
| **P1** | `(dashboard)/billing/upgrade-button.tsx` | After clicking upgrade, the button shows `"Redirecionando..."` but if the fetch fails silently (the catch block just calls `setLoading(false)` with no error message), the user sees nothing. |

**Recommendation:** Create `loading.tsx` files for every route group under `(dashboard)/` using skeleton components. The `Skeleton` component from shadcn/ui is already imported but barely used.

---

## 2. Missing Error States

| Severity | File | Issue |
|----------|------|-------|
| **P0** | `(dashboard)/map/page.tsx` | No `error.tsx` exists for this route. If any of the 10+ Supabase queries fail, or the GeoJSON fetch fails, the entire page crashes with Next.js default error. |
| **P0** | `(dashboard)/settings/page.tsx` | No error boundary. Multiple Supabase calls (`loadSettings`, `handleSave`) have no user-facing error for network failures. The save function shows success/error in the same undifferentiated style (both use `bg-brand/5 text-brand`). |
| **P0** | `(dashboard)/company/page.tsx` | No `error.tsx`. If `loadCompanyData()` server action fails, the user sees a blank page. |
| **P0** | `(dashboard)/documents/page.tsx` | No `error.tsx`. Supabase query failures result in blank page. |
| **P0** | `(dashboard)/billing/page.tsx` | No `error.tsx`. If `getActivePlans()` or `getUserWithPlan()` fails, page crashes. |
| **P0** | `(dashboard)/archive/page.tsx` | No `error.tsx`. |
| **P0** | `(dashboard)/competitors/page.tsx` | No `error.tsx`. |
| **P1** | `(dashboard)/billing/upgrade-button.tsx` | Uses `alert()` for errors -- raw browser dialog is unprofessional for a paid product. The catch block swallows errors silently. |
| **P1** | `components/map/IntelligenceMap.tsx` | GeoJSON fetch uses `.catch(console.error)` -- if the Brazil states GeoJSON fails to load, the choropleth silently disappears with no user notification. |
| **P1** | `(dashboard)/documents/document-actions.tsx` | `DeleteDocumentButton` does `await supabase.from(...).delete(...)` with no error handling at all. If delete fails, user sees no feedback. |
| **P1** | `(dashboard)/competitors/delete-watchlist-button.tsx` | Same issue -- delete with no error handling. |

**Routes WITH error boundaries (good):** `/dashboard`, `/opportunities`, `/pipeline`
**Routes WITHOUT error boundaries:** `/map`, `/settings`, `/company`, `/documents`, `/billing`, `/archive`, `/competitors`

---

## 3. Missing Empty States

| Severity | File | Issue |
|----------|------|-------|
| **P1** | `(dashboard)/pipeline/kanban-board.tsx` | Empty columns show `"Arraste cards para ca"` which is fine, but if ALL columns are empty (new user), there's no onboarding CTA. |
| **P1** | `(dashboard)/map/page.tsx` + `IntelligenceMap.tsx` | If a user has zero matches (new account), the map renders with no markers and no explanation. The sidebar shows `"0 Oportunidades"` with no call-to-action. |
| **P2** | `(dashboard)/settings/page.tsx` | Tags for UFs and keywords show nothing when empty -- no helper text explaining what they do. |

**Well-handled empty states (good):** Documents page, Dashboard top opportunities, Opportunities table, Competitors watchlist.

---

## 4. Unhandled Promise Rejections

| Severity | File | Issue |
|----------|------|-------|
| **P0** | `(dashboard)/documents/document-actions.tsx:16` | `DeleteDocumentButton`: `await supabase.from('company_documents').delete().eq('id', docId)` -- no `.catch()`, no try-catch, no error check on response. |
| **P0** | `(dashboard)/competitors/delete-watchlist-button.tsx:16` | `await supabase.from('competitor_watchlist').delete().eq('id', watchlistId)` -- same issue. |
| **P1** | `(dashboard)/billing/upgrade-button.tsx:23` | The `catch` block only calls `setLoading(false)` -- no error message shown to user. Network failures are silently swallowed. |
| **P1** | `components/settings/WhatsAppConnect.tsx:37-39` | `loadStatus()` catch block is empty (`// ignore`). If the status check fails, user gets no indication. |
| **P1** | `components/settings/WhatsAppConnect.tsx:113-115` | `disconnect()` catch block is empty. If disconnect fails, user gets no feedback. |
| **P1** | `components/map/IntelligenceMap.tsx:153` | GeoJSON fetch `.catch(console.error)` -- error is logged but user sees broken map with no explanation. |

---

## 5. Form Validation

| Severity | File | Issue |
|----------|------|-------|
| **P1** | `(dashboard)/company/page.tsx` | The main save button (`handleSave`) only checks for CNPJ and Razao Social on the client, but the CNPJ format is not validated (only checks if non-empty after stripping non-digits). No regex validation for proper CNPJ format (14 digits). The form is not a `<form>` element -- it uses `onClick` on a `<Button>`, so Enter key doesn't submit. |
| **P1** | `(dashboard)/settings/page.tsx` | The save button uses `onClick` instead of form `onSubmit`. No form wrapping the inputs, so Enter doesn't trigger save. No validation on `min_score` range. |
| **P1** | `(auth)/login/page.tsx` | Login form uses `action={handleSubmit}` which is a server action pattern. The button disables with `loading` state, but the `handleSubmit` function doesn't handle the case where `signIn` throws (no try-catch). If the server action crashes, the form stays in loading state forever. |
| **P1** | `(auth)/register/page.tsx` | Same issue -- no try-catch around `signUp` server action call. If it throws, loading state never resets. |
| **P2** | `(dashboard)/competitors/watchlist-form.tsx` | CNPJ validation is basic (14 digits length only). No proper CNPJ checksum validation. |
| **P2** | `(dashboard)/documents/add-document-form.tsx` | Submit button disables properly during loading. Error display works. But the form layout wraps awkwardly on mobile due to `flex-wrap`. |

**Well-done forms:** WhatsAppConnect (good state machine, validation, error display).

---

## 6. Responsive Design

| Severity | File | Issue |
|----------|------|-------|
| **P1** | `(dashboard)/pipeline/kanban-board.tsx` | Kanban columns use `min-w-[220px] sm:min-w-[260px]` with horizontal scroll. On mobile this works but 5 columns * 220px = 1100px minimum -- requires extensive horizontal scrolling. No mobile-optimized stacked view. Drag-and-drop is also problematic on touch devices (PointerSensor only, no TouchSensor). |
| **P1** | `components/map/IntelligenceMap.tsx` | Map sidebar is `h-1/3` on mobile which is very small for the ranking list. The filter controls (score slider, region buttons) are cramped. |
| **P1** | `(dashboard)/competitors/page.tsx` | The competitors analysis table (line 230+) uses an HTML table that can overflow on mobile. The `overflow-x-auto` wrapper exists but the table content is very wide. |
| **P2** | `(dashboard)/documents/add-document-form.tsx` | Uses `flex-wrap` with `min-w-[200px]` fields. On narrow screens, the button may wrap to a new line without alignment. |
| **P2** | `(dashboard)/opportunities/page.tsx` | Filter form uses `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` which handles responsive well, but the "Filtrar" button and "Limpar filtros" link wrap awkwardly on some intermediate widths. |

**Well-handled responsive:** Dashboard layout, sidebar (collapsible on desktop, drawer on mobile), landing page.

---

## 7. Accessibility (WCAG 2.1 AA)

### 7a. Images & Alt Text

| Severity | File | Issue |
|----------|------|-------|
| **P2** | `app/page.tsx` | Footer logo uses `brightness-0 invert` CSS filter which is fine, but the alt text is just `"Licitagram"` -- adequate but could be more descriptive. |
| **P2** | `components/dashboard-sidebar.tsx` | Logo alt text is `"Licitagram"` -- acceptable. |

SVG icons throughout the app consistently lack `aria-label` or `aria-hidden="true"` attributes. Decorative SVGs (check marks, arrows, stars) should have `aria-hidden="true"`.

### 7b. Keyboard Navigation

| Severity | File | Issue |
|----------|------|-------|
| **P1** | `app/page.tsx` | FAQ section uses `<details>/<summary>` which is natively keyboard-accessible -- good. |
| **P1** | `(dashboard)/pipeline/kanban-board.tsx` | Drag-and-drop is mouse/touch only. No keyboard alternative to move cards between columns. Screen reader users cannot use the pipeline at all. |
| **P1** | `components/map/IntelligenceMap.tsx` | Map markers are `<div>` elements inside Mapbox markers -- not keyboard focusable. The entire map feature is inaccessible to keyboard-only users. |
| **P2** | `(dashboard)/company/page.tsx` | Tag removal via `onClick` on `Badge` components -- these are `<span>` elements, not `<button>` elements. Not keyboard accessible. Same issue in `settings/page.tsx`. |

### 7c. Form Labels

| Severity | File | Issue |
|----------|------|-------|
| **P1** | `(dashboard)/opportunities/page.tsx` | Filter form inputs use `<label>` elements but they are NOT associated with their inputs via `htmlFor`/`id`. Screen readers cannot link labels to controls. This affects all 8+ filter dropdowns and inputs across both opportunities and archive pages. |
| **P1** | `(dashboard)/archive/page.tsx` | Same issue -- labels not associated with inputs. |
| **P1** | `(dashboard)/settings/page.tsx` | Checkbox inputs for notification channels have no `id` attribute and the wrapping `<label>` uses implicit association (which works) but the range input for min_score has no `id`. |
| **P1** | `components/map/IntelligenceMap.tsx` | Filter controls (score slider, value dropdown) have visual labels but no `htmlFor`/`id` association. |

### 7d. Color Contrast

| Severity | File | Issue |
|----------|------|-------|
| **P1** | Multiple files | `text-gray-400` on white/light backgrounds is used extensively for secondary text. Gray-400 (#9CA3AF) on white (#FFFFFF) has a contrast ratio of ~2.86:1 -- fails WCAG AA (requires 4.5:1 for normal text). Affected: KPI labels on dashboard, filter labels, table secondary text, empty state messages. |
| **P2** | `app/page.tsx` | Landing page hero text `text-[#9C9C90]` on dark background `#26292E` -- contrast ratio ~3.8:1 for body text, fails AA for normal text (needs 4.5:1). |
| **P2** | `app/page.tsx` | `text-[#69695D]` on `#FAFAF8` background -- contrast ratio ~4.2:1, borderline fail for normal text. |

### 7e. ARIA Roles

| Severity | File | Issue |
|----------|------|-------|
| **P1** | `(dashboard)/pipeline/kanban-board.tsx` | No ARIA live region for the error message that appears/disappears on drag failure. Screen readers won't announce the error. |
| **P2** | `(dashboard)/opportunities/[id]/chat.tsx` | Chat messages area has no `role="log"` or `aria-live` region. New messages are not announced to screen readers. |

---

## 8. Console Statements in Production Client Code

| Severity | File | Line(s) | Statement |
|----------|------|---------|-----------|
| **P1** | `opportunities/[id]/chat.tsx` | 142 | `console.error('PDF extraction error:', err)` |
| **P1** | `opportunities/[id]/chat.tsx` | 302, 334 | `console.log('[Chat Auto] Downloading...')`, `console.log('[Chat Auto] Extracted...')` |
| **P1** | `opportunities/[id]/chat.tsx` | 309, 321, 325, 336, 339 | Multiple `console.warn(...)` statements |
| **P2** | `components/map/IntelligenceMap.tsx` | 177 | `.catch(console.error)` on GeoJSON fetch |

**Server-side console statements** (API routes, server actions, lib files) are acceptable for logging. The **client-side** statements above ship to the user's browser and expose implementation details.

---

## 9. Error Boundaries

| Severity | Issue |
|----------|-------|
| **P0** | Only 3 out of 11 dashboard routes have `error.tsx` boundaries: `/dashboard`, `/opportunities`, `/pipeline`. |
| **P0** | No **root** `error.tsx` or `global-error.tsx` exists. If the root layout or any unlisted route crashes, users see the Next.js default error page. |
| **P0** | No error boundary for the `(admin)` route group (8 pages with no protection). |
| **P0** | No error boundary for the `(auth)` route group (login/register). |

**Missing `error.tsx` for the following routes:**
- `(dashboard)/map/`
- `(dashboard)/settings/`
- `(dashboard)/company/`
- `(dashboard)/documents/`
- `(dashboard)/billing/`
- `(dashboard)/archive/`
- `(dashboard)/competitors/`
- `(admin)/admin/` (and all sub-routes)
- Root `app/`

---

## 10. 404 Handling

| Severity | Issue |
|----------|-------|
| **P0** | No `not-found.tsx` file exists anywhere in the app. Users hitting invalid URLs get the default Next.js 404 page, which is completely unbranded. |
| **P1** | `(dashboard)/opportunities/[id]/page.tsx` correctly uses `notFound()` when a match is not found -- but there is no custom `not-found.tsx` to render. |
| **P1** | `(dashboard)/opportunities/tender/[id]/page.tsx` handles missing tenders inline with a simple message, but it does NOT call `notFound()` -- it returns a minimal `<div>` with no navigation context (sidebar disappears would not happen since it's in the layout, but the page looks bare). |

---

## 11. External Links

| Severity | File | Issue |
|----------|------|-------|
| **P2** | All `target="_blank"` links found DO include `rel="noopener noreferrer"` -- this is properly handled. |
| **P2** | `app/page.tsx` line 186 | YouTube iframe embed does NOT have `rel="noopener noreferrer"` but this is an iframe, not a link -- security concern is minimal since it uses `pointer-events-none`. However, the iframe loads YouTube on every page visit which impacts LCP. Consider lazy loading. |

**Status: PASS** -- All external `<a>` links properly use `rel="noopener noreferrer"`.

---

## 12. Font Loading

| Severity | Issue |
|----------|-------|
| **PASS** | `app/layout.tsx` uses `display: 'swap'` for all three fonts (Space_Grotesk, IBM_Plex_Mono, Roboto). This prevents FOIT (Flash of Invisible Text) and is the recommended strategy. |
| **P2** | Three different fonts are loaded (Space_Grotesk, IBM_Plex_Mono, Roboto). The landing page uses Space_Grotesk, the dashboard uses Roboto (via `font-roboto` class on the layout). IBM_Plex_Mono appears to be loaded but rarely used. Consider removing unused font weights to reduce bundle. |

---

## Priority Summary

### P0 -- Broken / Would lose customers (12 issues)

1. No `loading.tsx` files anywhere -- pages appear frozen during server-side data fetching
2. 8 dashboard routes have no `error.tsx` -- crashes show default Next.js error
3. No root `error.tsx` / `global-error.tsx`
4. No `not-found.tsx` -- 404s show unbranded default page
5. Delete operations (documents, watchlist) have no error handling
6. Map page has no error boundary and multiple failure points
7. Settings page save uses same styling for success and error messages
8. Login/Register forms can get stuck in loading state if server action throws
9. Company page has no error boundary
10. Billing page has no error boundary
11. `UpgradeButton` swallows network errors silently
12. Admin pages have zero error protection

### P1 -- Unprofessional for paid product (18 issues)

1. Raw "Carregando..." text instead of skeletons (company, settings, compliance, historical prices)
2. Pipeline kanban not usable on touch/keyboard
3. Map completely inaccessible to keyboard users
4. Form labels not associated with inputs (opportunities, archive, settings, map filters)
5. `text-gray-400` fails WCAG AA contrast on white backgrounds (pervasive)
6. `alert()` used for payment errors in UpgradeButton
7. GeoJSON fetch failure silently breaks map
8. Console.log statements in client-side chat component
9. No ARIA live regions for dynamic content (pipeline errors, chat messages)
10. Tag removal (company, settings) uses non-focusable elements
11. Kanban has no mobile-optimized view
12. No empty state/onboarding for new users on map page

### P2 -- Polish issues (8 issues)

1. Landing page text contrast borderline fails
2. Three fonts loaded (one barely used)
3. YouTube iframe not lazy-loaded (LCP impact)
4. CNPJ validation is length-only (no checksum)
5. Form layouts wrap awkwardly at some breakpoints
6. SVG icons lack `aria-hidden="true"`
7. Empty state text could be more actionable
8. Some settings form inputs not keyboard-submittable

---

## Files Audited

### Pages (20 routes)
- `/apps/web/src/app/page.tsx` (landing)
- `/apps/web/src/app/layout.tsx` (root layout)
- `/apps/web/src/app/(auth)/login/page.tsx`
- `/apps/web/src/app/(auth)/register/page.tsx`
- `/apps/web/src/app/(dashboard)/layout.tsx`
- `/apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `/apps/web/src/app/(dashboard)/opportunities/page.tsx`
- `/apps/web/src/app/(dashboard)/opportunities/[id]/page.tsx`
- `/apps/web/src/app/(dashboard)/opportunities/tender/[id]/page.tsx`
- `/apps/web/src/app/(dashboard)/pipeline/page.tsx`
- `/apps/web/src/app/(dashboard)/map/page.tsx`
- `/apps/web/src/app/(dashboard)/competitors/page.tsx`
- `/apps/web/src/app/(dashboard)/documents/page.tsx`
- `/apps/web/src/app/(dashboard)/company/page.tsx`
- `/apps/web/src/app/(dashboard)/settings/page.tsx`
- `/apps/web/src/app/(dashboard)/billing/page.tsx`
- `/apps/web/src/app/(dashboard)/archive/page.tsx`

### Client Components (16)
- `kanban-board.tsx`, `status-dropdown.tsx`, `status-changer.tsx`
- `chat.tsx`, `compliance-checker.tsx`, `historical-prices.tsx`, `ai-analysis.tsx`, `score-header.tsx`
- `watchlist-form.tsx`, `delete-watchlist-button.tsx`
- `add-document-form.tsx`, `document-actions.tsx`
- `upgrade-button.tsx`
- `WhatsAppConnect.tsx`, `IntelligenceMap.tsx`
- `dashboard-sidebar.tsx`, `mobile-menu.tsx`

### Error Boundaries (3 exist, 8+ missing)
- `dashboard/error.tsx` -- EXISTS
- `opportunities/error.tsx` -- EXISTS
- `pipeline/error.tsx` -- EXISTS

### Loading States (0 exist)
- No `loading.tsx` files found

### 404 Handling (0 custom)
- No `not-found.tsx` files found
