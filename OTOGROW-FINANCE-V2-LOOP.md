# Otogrow Finance V2 — Loop Engineering System

Status: **Active** (initiated 2026-11-24 alongside `OTOGROW-OS-DESIGN-QA-LOOP.md`).
Scope: Complete replacement of the 7-tab Finance UI with a self-balancing, plain-English 6-tab Finance OS (`Dashboard`, `Quotes & Invoices`, `Expenses & Assets`, `Payroll`, `Liabilities`, `Setup & Exports`) consolidating multi-currency operations into **AED** on the Profit & Loss and Balance Sheet.

---

## The Repeatable Engineering Loop

Every milestone passes through this closed loop before advancing:

1. **Design & Contract Lock** — Verify schema constraints, accounting math, access boundaries, and plain-English UI hierarchy.
2. **Bounded Implementation** — Implement one cohesive vertical slice (entities/migration, policy/service/resolver/controller, frontend views & tests).
3. **Automated Gate Run (`node packages/twenty-server/scripts/check-finance-v2-loop.cjs`)** — Run all mandatory invariants, backend/frontend unit + behavior tests, direct `tsgo --noEmit` typechecks (never cached `nx typecheck`), scoped lint, and migration timestamp checks.
4. **Independent Engineering & Accounting Critique** — A separate reviewer subagent who did NOT write the slice audits accounting invariants, edge cases, access privacy, UX readability, and regression risks with concrete file/line findings.
5. **Rework & Retest** — Fix every valid finding, add targeted regression tests, and re-run the automated gate runner until 100% green.
6. **Record Evidence & Advance** — Log exact commands, pass counts, findings fixed, and remaining limitations below.

---

## Mandatory Quality & Accounting Gates

| Gate ID | Name | Pass Criteria |
| --- | --- | --- |
| `G1-DOUBLE-ENTRY` | Double-Entry Balance | Every posted journal has `>= 2` lines, strictly single-sided positive AED micros per line, and `sum(debits) === sum(credits)`. |
| `G2-BALANCE-SHEET` | Balance Sheet Identity | `Total Assets (AED) === Total Liabilities (AED) + Total Equity (AED)` holds across Opening Balances, Paid Invoices, Direct/Indirect Expenses (Cash & Person Liability), Assets, Loans In, Repayments, Payroll Adjustments, Currency Conversions, and Voids/Reversals. |
| `G3-CASH-BASIS` | Cash-Basis Revenue | Creating, sending, or voiding a Quote or Invoice never changes P&L Revenue, Cash, or Equity until payment is recorded; overdue days count accurately after due date while unpaid. |
| `G4-PAYROLL-POLICY` | Payroll & Hidden Leave Rule | `Per-day = Base ÷ WorkingDays` (default 26), internal 2-day monthly paid leave reset (use-it-or-lose-it, never exposed to non-finance roles), Sunday/day swaps cancel leave without burning paid leave or adding OT, and Payday posts non-recurring OT/Leave/Bonus into Day-to-Day Expenses matching net cash outflow. |
| `G5-IDEMPOTENCY` | Cron & Auto-Run Safety | Recurring Expenses, Recurring Invoices, Payday Payroll runs, and AI cost imports are strictly idempotent per `(sourceRefType, sourceRefId)` or `(scheduleId, month)`. |
| `G6-ACCESS-PRIVACY` | Role & Privacy Isolation | Non-finance users receive `403 Forbidden` on all Finance V2 GraphQL queries, mutations, and PDF endpoints; Payroll & leave allowance never leak outside finance permissions. |
| `G7-NO-REGRESSION` | Zero OS Breakage | Shared helpers (`finance-money.ts`, `useFinanceLabels.ts`, `useFinanceExportRequestGuard.ts`) and existing dependent OS tests remain green; direct `tsgo --noEmit` passes in `twenty-server` and `twenty-front`. |
| `G8-DESIGN-UX` | Plain-English UX & Layout | 6 clear tabs, zero confusing "this does not record" jargon, responsive desktop + narrow mobile layouts, accessible labels/errors/loading/empty states, PDF download + manual Send Email flow. |

---

## Milestone Board

| Milestone | Scope | Status | Gate Result | Reviewer Critique |
| --- | --- | --- | --- | --- |
| **M0** | Loop Engineering System (`OTOGROW-FINANCE-V2-LOOP.md` + `check-finance-v2-loop.cjs` + `check-finance-v2-pdf.ts`) | Implemented (local gates passed) | **PASS** (6/6) | **PASS** (Iter 3 sign-off) |
| **M1** | Schema, Migration (`2-34`), Double-Entry Ledger Engine, Opening Balances, FX & Currency Conversion, AED P&L + Balance Sheet | Implemented (local gates passed; live PG migration pending) | **PASS** (G1, G2, G5, G7) | **PASS** (Iter 3 sign-off) |
| **M2** | Expenses & Assets (Direct / Indirect / Asset), Recurring Expenses + Cron, AI Cost Import, Liabilities (Owed to People + Loans + Repayments) | Implemented (local gates passed) | **PASS** (G1, G2, G5, G6) | **PASS** (Iter 3 sign-off) |
| **M3** | Payroll Engine (Linked Base Salary, Working Days ÷ 26, Hidden 2 Paid Leaves, Sunday Swaps, Overtime, Bonuses, Payday Auto-Post, Strict Admin Isolation) | Implemented (local gates passed) | **PASS** (G4, G5, G6) | **PASS** (Iter 3 sign-off) |
| **M4** | Quotes & Invoices (Rate Card, Branded PDF Engine, Download + Manual Send Email, Convert Quote → One-Off / Recurring Invoice, Void, Overdue Days, Cash-Basis Payment) | Implemented (local gates passed) | **PASS** (G3, G5, G6) | **PASS** (Iter 3 sign-off) |
| **M5** | 6-Tab Frontend Workspace, CSV Exports, Independent Review Loop (3 Iterations), Rework & Final Gate Verification | Implemented (local gates passed; live browser visual QA & production deploy pending) | **PASS** (G7, G8, 171/171 front & 95/95 server delivery suites) | **PASS** (Iter 3 sign-off) |
| **M6** | Executive Visibility: Unified-Currency Payroll Totals + Switcher + Cash Readiness + `<tfoot>`, Dashboard Monthly/Custom Date-Range KPIs, Margins, 6-Month Trend, Expense Breakdown, Burn/Runway, 30d Commitments, Aging & Project Profitability | Implemented & Hardened (all 12 review findings fixed) | **PASS** (6/6; 21/21 server, 13/13 front) | **PASS** (Iter 4 review + rework) |
| **M7** | Security, Financial Integrity & Edge-Case Hardening: FX Overdraft/Inflow Carrying AED, `bigint` Overflow Bounds, Logo Binary Validation + PDF Fallback, `receiptUrl` Sanitization, Non-Admin Payroll Privacy, `clientRequestId` Idempotency, Email TOCTOU & Rate Limiting | Implemented & Hardened (all 10 review findings fixed) | **PASS** (6/6; 28/28 server, 15/15 front) | **PASS** (Iter 5 review + rework) |
| **M8** | UX & Workflow Polish Across All 5 Tabs: Inline Edit/Pay/Email/Void/Convert/Details Panels, Exact BigInt Draft Totals, Duplicate/Search/Filter, Archived Account Guards, Unsaved-Changes & Destructive Confirmations | Implemented & Hardened (all 11 review findings fixed) | **PASS** (6/6; 29/29 server, 17/17 front) | **PASS** (Iter 6 review + rework) |
| **M9** | Accounting Controls, Production Reliability, Performance & CRM Unification: Period Lock & Reversal Journals, Workspace Timezone & Explicit Payroll Timing, Cached Logo Endpoint, DB Indexes (`1795508500000`), Cron Spec, and Founder Performance V2 Link Alignment | Implemented & Hardened (all 15 review findings fixed) | **PASS** (6/6; 38/38 server, 18/18 front, 124/124 founder) | **PASS** (Iter 7 review + rework) |

---

## Iteration Evidence Log

### Iteration 1 — Initial Vertical Implementation & First Independent Audit (2026-11-24)
- **Built:**
  - Loop system: `OTOGROW-FINANCE-V2-LOOP.md`, `packages/twenty-server/scripts/check-finance-v2-loop.cjs`, `packages/twenty-server/scripts/check-finance-v2-pdf.ts`.
  - Migration `2-34-instance-command-fast-1795508400000-add-delivery-finance-v2.ts` (registered in `instance-commands.constant.ts`) + 10 TypeORM entities under `packages/twenty-server/src/modules/delivery/finance-v2/entities/`.
  - Backend: `finance-v2.types.ts`, `finance-v2.policy.ts`, `finance-v2-schemas.ts`, `finance-v2-pdf.util.ts`, `finance-v2.service.ts`, `finance-v2.resolver.ts`, `finance-v2-files.controller.ts`, `finance-v2.cron.job.ts`, `finance-v2.cron.command.ts` + module/job/cron wiring.
  - Frontend: `DeliveryFinance.tsx` mounted `DeliveryFinanceV2Workspace.tsx` with 6 tabs (`FinanceV2DashboardTab`, `FinanceV2QuotesInvoicesTab`, `FinanceV2ExpensesTab`, `FinanceV2PayrollTab`, `FinanceV2LiabilitiesTab`, `FinanceV2SetupTab`), Linaria styles, GraphQL operations, and tests.
- **Independent Review #1 (`c09d3225-d350-443e-803e-45d64a9b6d70`):** Identified **19 findings** (6 Critical `C1–C6`, 9 High `H7–H15`, 4 Medium `M16–M19`): BullMQ Buffer serialization & email `From` header, payday timing, voided cron resurrection, non-admin Payroll leakage, leave deduction cap, ledger/payment voiding UI, 9-currency cash bootstrap, query truncation, weighted carrying AED FX closeout, CSV signed numbers, `0` paid leaves & month-date sync, `insertOrIgnore` + PDF outside tx, controller guards + `ParseUUIDPipe`, inline form validation, Edit flows & confirmation dialogs, and migration `down()` guards.

### Iteration 2 — Rework of All 19 Iteration 1 Findings & Second Adversarial Audit (2026-11-24)
- **Implemented:** Fixed all 19 Iteration 1 findings (`C1–M19`), added untruncated `INVOICE_PAYMENT` lookup, updated two legacy component test suites (`DeliveryMonthlyFinance.test.tsx`, `DeliveryFinanceAiCosts.test.tsx`) to mount their legacy subcomponents directly instead of the replaced `DeliveryFinance` shell, built `twenty-sdk` & `twenty-front-component-renderer` declarations, and expanded backend & frontend regression suites.
- **Checks Run:**
  - `node packages/twenty-server/scripts/check-finance-v2-loop.cjs` → **6/6 PASS** (`G5-MIGRATION-ORDER`, `G1-G6-SERVER-TESTS` 17/17, `G3-REAL-PDF-SMOKE`, `G7-G8-FRONT-TESTS` 5/5, `G7-SERVER-TSGO`, `G7-FRONT-TSGO`).
  - Full `delivery/` regression suites: backend **95/95 suites (1,139/1,139 tests) PASS**; frontend **171/171 suites (1,992/1,992 tests) PASS** after updating the 2 legacy test shells (32/32 tests).
- **Independent Review #2 (`df65c2da-8671-434a-b7ea-8824cd4aed13`):** Caught **3 Critical (`CR-1`–`CR-3`)**, **4 High (`HI-1`–`HI-4`)**, **7 Medium (`MD-1`–`MD-7`)**, and **11 Low** findings:
  - `CR-1`: `DeliveryFinanceV2CronCommand` double-registered in `DeliveryModule` and `DatabaseCommandModule` (would crash CLI commands on boot).
  - `CR-2`: Composite `ON DELETE SET NULL` on `NOT NULL workspaceId`, `ON DELETE RESTRICT` blocking `DELETE FROM core.workspace`, and entity↔migration FK drift.
  - `CR-3`: Non-admin `finance.read`/`finance.manage` could still see employee salaries in `recurringExpenses`/`journals`/`LEDGER` CSV or mutate linked payroll rules/journals.
  - `HI-1`: Foreign cash outflows in loan repayment, expenses, recurring bills, payroll adjustments, and AI imports booked at spot AED instead of weighted carrying AED.
  - `HI-2`: Early-month payday (`<= 10`) shifted adjustments but not linked base salaries.
  - `HI-3`: CSV `formatMicrosPlain` truncated sub-cent micros via `.slice(0, 2)`.
  - `HI-4`: Shared form state across `FinanceV2QuotesInvoicesTab` sub-tabs could overwrite the wrong document.
  - `MD-1`–`MD-7` & Low #1–#11: Edit field wiping (`endMonth`/`notes`/`projectId`), `persistInvoicePdf` read-modify-save race, stamping `SENT` before email enqueue, tenant ownership checks on `projectId`/`employeeMemberId`, cron bootstrapping unused workspaces, UI invoice slicing hiding oldest overdue invoices, invalid URL date filter recovery, re-void guards, `to_regclass` in `down()`, `image/jpg` normalization, Lingui labels, and UI polish.

### Iteration 3 — Full Hardening, Regression Coverage & Independent Sign-Off (2026-11-24)
- **Implemented:** Resolved every single finding from Review #2 (`CR-1`–`CR-3`, `HI-1`–`HI-4`, `MD-1`–`MD-7`, and all 11 Low items) and added targeted backend & frontend regression tests for each.
- **Formatting:** `oxfmt` formatted all 34 Finance V2 / Delivery files cleanly (0 remaining format diffs).
- **Final Automated Gate Run (`node packages/twenty-server/scripts/check-finance-v2-loop.cjs`):**
  - `[PASS] G5-MIGRATION-ORDER` — 57 instance commands verified unique & monotonic (`1795508400000`).
  - `[PASS] G1-G6-SERVER-TESTS` — **2/2 suites, 18/18 tests PASS** (`finance-v2.policy.spec.ts`, `finance-v2.service.spec.ts`).
  - `[PASS] G3-REAL-PDF-SMOKE` — Real `@react-pdf/renderer` PDF generation PASS (`Invoice=25562 bytes`, `Quote=25277 bytes`).
  - `[PASS] G7-G8-FRONT-TESTS` — **2/2 suites, 6/6 tests PASS** (`DeliveryFinance.test.tsx`, `DeliveryFinanceV2Workspace.test.tsx`).
  - `[PASS] G7-SERVER-TSGO` — Direct `tsgo -p tsconfig.json --noEmit` in `packages/twenty-server` PASS (0 errors, 24.4s).
  - `[PASS] G7-FRONT-TSGO` — Direct `tsgo -p tsconfig.json --noEmit` in `packages/twenty-front` PASS (0 errors, 44.9s).
- **Independent Sign-Off #3 (`df65c2da-8671-434a-b7ea-8824cd4aed13`):** **SIGN-OFF APPROVED (PASS)** — 0 Critical, High, or Medium regressions. Two optional non-blocking low-priority polish notes recorded for future iteration (`effectiveEndMonth` guard on direct partial API update; preserving an unchanged deactivated `employeeMemberId` on payroll edit).

### Iteration 4 — M6 Executive Visibility (Unified-Currency Payroll & Dashboard Analytics) & Rework (2026-11-24)
- **Implemented:**
  - Unified-currency Payroll KPI strip, native currency breakdown & cash-readiness check (`asOfDate`-labeled), payroll-to-revenue ratio, `<tfoot>` totals row, and URL-persisted display currency switcher (`financeCurrency`).
  - Dashboard smart period selector (`This Month`, `Last Month`, `Last 30 Days`, `This Quarter`, `Year to Date`, `All Time`, `←/→` month stepper, custom date range with synced/optional `customAsOf`), full 7-card KPI hero grid with period-over-period deltas, 6-month trend visual + table, clickable Expense Category Breakdown with Expenses ledger drilldown, Cash Flow & Runway, Next 30 Days Commitments, Invoice Aging Buckets, and Project Profitability table.
- **Independent Review #4 (`fa78120a7647cec613959c3c4a129934`):** Caught **12 findings** (1 Critical: `FX_GAIN_LOSS` leaking into project profitability; 4 High: broken `financeCategory` drilldown filter, non-admin payroll breakdown & `PNL` CSV / unassigned project leakage, `upcomingCommitments30d` 31-day/already-posted/early-payday/voided-schedule bugs, `OPENING_BALANCE` & mid-month `asOfDate` burn math; 5 Medium: invalid calendar date/month input validation, `customAsOf` preset clobbering, zero/negative bar & `+0` formatting, cash readiness `asOfDate`/FX subtitle, container-query/HTML-inside-button/a11y fixes; 2 Low: zero-rounded `+0%` delta, expanded M6 tests).
- **Rework & Final M6 Gate Run (`node packages/twenty-server/scripts/check-finance-v2-loop.cjs`):** Fixed all 12 findings, added `finance-v2-currency.test.ts` + expanded policy/service/workspace regression tests, formatted with `oxfmt`, and verified **6/6 PASS** (`21/21` server tests, `13/13` front tests, PDF smoke, server & front `tsgo --noEmit`).

### Iteration 5 — M7 Security, Financial Integrity & Edge-Case Hardening + Rework (2026-11-24)
- **Implemented:**
  - Weighted-average FX overdraft split (`computeWeightedCarryingAed`) + negative carrying AED extinguishment (`computeWeightedInflowAed`, `resolveCashInflowCarryingAed`) across `convertCurrency` (removing `fromFxRateToAed` bypass), `recordLoanIn`, `recordInvoicePayment`, and `PAYROLL_LEAVE_REDUCTION`.
  - PostgreSQL `bigint` overflow bounds (`assertWithinMaxMicros`, `MAX_AMOUNT_MICROS = 9e18`) enforced across FX conversions, journal totals, document line totals, payroll math, and frontend `MAX_FINANCE_ENTRY_MICROS`.
  - Logo preservation on partial `saveCompanyProfile` (`patchableLogoDataUrl`), strict canonical base64 + PNG (`IHDR` length + `IDAT`/`IEND` chunks) & JPEG (strict marker framing + `SOF`/`SOS`/`EOI`) binary validation (`validateLogoDataUrl`), plus graceful PDF fallback in `renderFinanceV2PdfBuffer`.
  - End-to-end `receiptUrl` `http:`/`https:` validation & render sanitization (`sanitizeExternalUrl`, `isValidHttpUrl`).
  - Non-admin payroll privacy hardening via unified case-insensitive `isPayrollSensitiveCategory` (`DIRECT_SALARY` + `PAYROLL_*`) across `DIRECT_EXPENSE` and `INDIRECT_EXPENSE` P&L breakdowns, `snapshot()`, `LEDGER` CSV, `recordExpenseOrAsset`, `saveRecurringExpense`, `setRecurringExpenseStatus`, and `voidJournal`; admin-locked `runDueAutomation` with `asOfDate <= today` clamping and Dashboard button gating.
  - Idempotent `clientRequestId` keys across all 6 money-posting actions (including post-`PAID` invoice retries and non-resurrection of voided journals), email in-flight lock + post-render TOCTOU/edit re-check + `CONVERTED` quote block + activity audit logs + bounded sliding-window rate limiters for email and PDF downloads, plus stale FX clearing on currency switch across all frontend tabs.
- **Independent Review #5 (`0857e7e814895256807a97665412c53e`):** Caught **5 High** (`H1` `PAYROLL_LEAVE_REDUCTION` inflow carrying AED bypass, `H2` `PAYROLL_*`/case-variant & `INDIRECT_EXPENSE` redaction gaps, `H3` cumulative payroll `bigint` overflow bricking `snapshot()`, `H4` email TOCTOU window & `CONVERTED` quote dispatch, `H5` truncated PNG/JPEG & missing PDF fallback) and **4 Medium** (`M1` voided `clientRequestId` resurrection + charset + toggle reset, `M2` rate-limit map pruning & validation order, `M3` Dashboard automation button gating & admin message, `M4` frontend max limit checks on line items/payroll) + **L1** (`financeV2FxRateSchema` non-throwing `.refine()`). Note: preserved `ForbiddenException` on payroll mutations to honor existing G6 contract tests.
- **Rework & Final M7 Gate Run (`node packages/twenty-server/scripts/check-finance-v2-loop.cjs`):** Fixed all High/Medium/L1 findings, added targeted policy/service/frontend regression tests, formatted with `oxfmt`, and verified **6/6 PASS** (`28/28` server tests, `15/15` front tests, PDF smoke, server & front `tsgo --noEmit`).

### Iteration 6 — M8 UX & Workflow Polish Across All 5 Tabs + Rework (2026-11-24)
- **Implemented:**
  - **Quotes & Invoices (`FinanceV2QuotesInvoicesTab.tsx`, `finance-v2-currency.ts`, `finance-v2.policy.ts`):** Inline row panels for `Edit`, `Mark Paid` (with overpayment block), `Send Email`, `Void` (invoice/payment/quote), `Convert to Invoice`, and read-only `Details` on `PAID`/`CONVERTED`/`VOID` docs; exact BigInt live Subtotal/Discount/Grand Total calculator (`calculateDraftDocumentTotals`); unlabeled-row warning + qty/discount validators; Project `<select>` + auto-filled `defaultInvoiceNotes`; search & status/currency/project filters; `projectName` & `voidReason` visibility; inline confirmation before stopping recurring schedules; single-panel exclusivity; `<form onSubmit>` + `StyledFinanceV2ActionGroup`; unsent `READY` drafts no longer count as overdue (`calculateOverdueDays`).
  - **Expenses & Assets (`FinanceV2ExpensesTab.tsx`):** Inline row `Void`, Recurring `Edit` & `Stop` confirmation, AI `Import All` confirmation, `Duplicate` action on manual rows, search + currency/category/project filters, `category`/`projectName`/`fxRateToAed`/`voidReason` visibility, and non-USD AI spend currency rendering.
  - **Liabilities (`FinanceV2LiabilitiesTab.tsx`, `finance-v2-schemas.ts`, `finance-v2.service.ts`):** Inline card panels for `+ Loan In`, `Repay` (pre-filled owed currency & amount), `Edit`, `Archive` confirmation (backend guarded against non-zero balance, active/paused recurring rules, or active payroll profiles), and per-person `History` matched by `targetAccountId`; `personEmail` visibility.
  - **Setup & Payroll (`FinanceV2SetupTab.tsx`, `FinanceV2PayrollTab.tsx`):** Prop-to-state sync when not dirty + unsaved-changes banners + Discard/Reset; file input reset (`event.target.value = ''`); editable rate card; read-only disabled states; recorded Opening Balances table; active date-range CSV labels; Payroll search/currency filters & inline confirmations before `Post to Expenses (forceResync)` and event removal.
- **Independent Review #6 (`d6a681ded2e23c3fbab2635dd1744443`):** Caught **3 High** (`savePersonLiability` wiping `currency` to `null` on edit; archived person accounts accruing invisible liabilities via paused recurring resume, `recordOpeningBalance`, `recordLoanIn`, or stale Setup `openPersonId`; Repay pre-fill placing AED balance into non-AED currency input), **5 Medium** (stale Expenses/Recurring draft state after Duplicate/Edit; off-screen top-level `formError` during inline edits; Liabilities History matching by `targetAccountName` instead of `targetAccountId`; Setup labeling date-filtered Ledger CSV as `Full Ledger`; mixed-currency AI funding selector allowing single-currency cash accounts), and **3 Low** (stale Convert billing/due day; whitespace-only `quantity` preview mismatch; stale Payroll/Expenses/Setup confirmation & error resets).
- **Rework & Final M8 Gate Run (`node packages/twenty-server/scripts/check-finance-v2-loop.cjs`):** Resolved all 11 findings, added backend & frontend M8 regression tests, formatted with `oxfmt`, and verified **6/6 PASS** (`29/29` server tests, `17/17` front tests, PDF smoke, server & front `tsgo --noEmit`).

### Iteration 7 — M9 Accounting Controls, Production Reliability, Performance & CRM Unification + Rework (2026-11-24)
- **Implemented:**
  - **Migration & Schema (`2-34-instance-command-fast-1795508500000-finance-v2-m9-indexes-and-settings.ts`, `instance-commands.constant.ts`):** Added `lockedThroughDate` and `timezone` (default `Asia/Dubai`) to `deliveryFinanceV2Profile`, nullable `payTiming` (`SAME_MONTH` / `FOLLOWING_MONTH` with legacy `payDayOfMonth <= 10` fallback — avoiding deploy-time data-mutation lock contention), `reversalOfJournalId` self-FK + partial unique index `UQ_deliveryFinanceV2Journal_ws_reversal` (`WHERE "reversalOfJournalId" IS NOT NULL AND status = 'POSTED'`), and composite reporting/query indexes across journals, documents, recurring rules, and payroll entries.
  - **Accounting Controls & Reversals (`finance-v2.service.ts`, `finance-v2.policy.ts`, `FinanceV2ExpensesTab.tsx`, `FinanceV2QuotesInvoicesTab.tsx`, `FinanceV2SetupTab.tsx`):** Enforced `assertDateNotLocked` across all money-posting, voiding, and payroll entry mutations; implemented `reverseJournal` creating balanced mirrored `REVERSAL` journals dated after `lockedThroughDate` (with `REVERSAL` rows + already-reversed journals permanently protected from `voidJournal`); added inline `Reverse` workflows on locked-period expenses and invoice payments (`Reversed` pill + default reversal date past lock date via `computeDefaultReversalDate`).
  - **Timezone, Payroll Timing & Cron Reliability (`finance-v2.cron.job.ts`, `finance-v2.cron.job.spec.ts`):** Replaced UTC date calculations with IANA workspace timezone (`todayIsoDateInTimezone`), wired explicit `payTiming` into payroll settlement and 30-day commitments, enforced recurring rule `startMonth`/`endMonth` bounds during payroll automation, fixed off-by-one month candidate building, and added dedicated `finance-v2.cron.job.spec.ts` coverage.
  - **Performance & CRM Unification (`finance-v2-files.controller.ts`, `DeliveryFinanceV2Workspace.tsx`, `packages/twenty-front/src/modules/delivery/founder/performance/`):** Served company logos from a cached `GET /rest/delivery/finance-v2/profile/logo` endpoint (`Cache-Control: private, no-cache`, RFC 9110 weak ETag matching, SHA-256 `logoUpdatedAt` hash cache-busting, `image/jpg` -> `image/jpeg` normalization) instead of embedding base64 in `snapshot()`; eliminated hardcoded colors in `FinanceV2DashboardTab.tsx`; aligned Founder Performance deep links (`AdminCashForecastPanel`, `AdminDashboardPulse`, `AdminSixMonthTrendPanel`, `DeliveryFounderPerformance`, `PerformanceDirectories`, `PerformanceFinancialSummary`) with Finance V2 tab/date/month query params (including legacy `financeMonth` fallback to `payrollMonth`).
- **Independent Review #7 (`441e942d5601c12712d55cc5b60e21f7`):** Caught **15 findings** (1 Critical: `voidJournal` allowing voiding of `REVERSAL` / already-reversed journals, missing DB uniqueness on `reversalOfJournalId`, and missing `Reverse`/reversed-pill UX on locked invoice payments; 4 High: `calculateBalanceSheet` & `calculateBurnAndRunway` misclassifying reversals of loans/opening balances, missing period lock on `addPayrollEntry`/`deletePayrollEntry`, weak ETag + `image/jpg` + unrelated-save `logoUpdatedAt` flicker on cached logo endpoint, and duplicate active payroll employee reactivation via `setRecurringExpenseStatus`; 5 Medium: remaining UTC `.toISOString().slice(0, 10)` on AI spend import/candidates, payroll automation resync/unique-key collision with reversed journals, `REVERSAL` rows hidden in default Expenses filter + duplicate error banner + locked default reversal date, payroll Step 2 missing recurring `startMonth`/`endMonth` bounds; 5 Low: `createQueryBuilder` `.orderBy` chaining, legacy `financeMonth` -> `payrollMonth` fallback, and logo `no-cache` fetch headers).
- **Rework & Final M9 Gate Run:** Resolved all 15 findings, added targeted M9 backend, cron, policy, and frontend regression tests, formatted with `oxfmt`, verified `oxlint` (**0 warnings, 0 errors** across 19 `twenty-front` and 23 `twenty-server` files), and verified:
  - `node packages/twenty-server/scripts/check-finance-v2-loop.cjs` → **6/6 PASS**:
    - `[PASS] G5-MIGRATION-ORDER` — 58 instance commands verified unique & monotonic (`1795508400000`, `1795508500000`).
    - `[PASS] G1-G6-SERVER-TESTS` — **3/3 suites, 38/38 tests PASS** (`finance-v2.policy.spec.ts`, `finance-v2.service.spec.ts`, `finance-v2.cron.job.spec.ts`).
    - `[PASS] G3-REAL-PDF-SMOKE` — Real `@react-pdf/renderer` PDF generation PASS (`Invoice=25562 bytes`, `Quote=25277 bytes`).
    - `[PASS] G7-G8-FRONT-TESTS` — **3/3 suites, 18/18 tests PASS** (`DeliveryFinanceV2Workspace.test.tsx`, `DeliveryFinance.test.tsx`, `finance-v2-currency.test.ts`).
    - `[PASS] G7-SERVER-TSGO` — Direct `tsgo -p tsconfig.json --noEmit` in `packages/twenty-server` PASS (0 errors, 6.0s).
    - `[PASS] G7-FRONT-TSGO` — Direct `tsgo -p tsconfig.json --noEmit` in `packages/twenty-front` PASS (0 errors, 7.0s).
  - Founder performance regression suite (`npx jest src/modules/delivery/founder/ --runInBand`) → **8/8 suites, 124/124 tests PASS**.

---

## Remaining Acceptance & Deployment Steps (Not Yet Executed Locally)

Because this local environment does not have PostgreSQL, Redis, Docker, or a live running dev server:
1. **Live PostgreSQL Migration Check:** Run both `2-34` upgrade commands (`AddDeliveryFinanceV2FastInstanceCommand` `1795508400000` and `AddDeliveryFinanceV2M9IndexesAndSettingsFastInstanceCommand` `1795508500000`) against a real PostgreSQL instance and verify `up()`, `down()` data-guard/index teardown, and workspace cascade delete.
2. **Cron Registration:** Run `cron:register:all` (or `cron:delivery:finance-v2`) on the deployment server so the daily `01:05 UTC` recurring/payroll/invoice automation job is active.
3. **Live Browser Visual & End-to-End QA:** Inspect all 6 tabs at desktop and narrow mobile viewports against a running `yarn start` instance, download real Quote & Invoice PDFs with your uploaded company logo, test manual email delivery via your configured SMTP provider, and verify `oxlint --type-aware` in CI (skipped locally due to Electron N-API SIGTRAP in this environment's `node` shim).
