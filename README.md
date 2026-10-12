# Unity-inspired Snowflake portal

A local Node.js/React developer portal with Snowflake trial onboarding and **two independently delivered private listings**. All displayed Unity identities, projects, and delivery results are synthetic. This is not an official Unity service.

## Run locally

Use Node.js 22.22.2+ or 24.15+ LTS. The existing machine's Node 23 runs the checks but produces engine-support warnings; use LTS for repeatable installation.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The API listens on loopback port 3001. Optional settings are listed in `.env.example`; copy them into a local `.env` if needed. The default needs no Snowflake account or credentials.

For a single-server production-style preview: `npm run build`, then `npm start`, and open http://127.0.0.1:3001. The API runs TypeScript using `tsx`; its build script typechecks while Vite builds the frontend.

## Workflow

Select a demo Unity identity, open Snowflake's official trial signup in a new tab (or use an existing account), and return to enter a URL or account identifier. The portal normalizes recognized forms into `ORG.ACCOUNT`; locator-only inputs require the Data Sharing Account Identifier from Snowsight. Normalization does **not** prove ownership, and connection aliases cannot be distinguished reliably from ordinary account URLs: confirm the actual account identifier before live use.

Review the separate Native App and dataset products, simulate delivery, and optionally simulate a one-time failure. Retry preserves the successful product. The SQL preview shows integration operations without executing them. No demo listing name is a live installation link. Trial signup is not automated and no unsupported signup callback is assumed.

## Present the deployment flow to Unity

Open http://127.0.0.1:5173/#deployment-flow, or choose **Deployment flow** in the sidebar or the page switch available on mobile. The guided five-step walkthrough explains account activation, the trusted identity/account binding, separate Native App and data paths, draft/publication, and consumer acceptance. Switching back to onboarding preserves its current review or delivery state.

Expand **See the implementation** to show actual repository excerpts and computed `path:line` references. Copy buttons copy the displayed snippet; clipboard failures provide manual-copy guidance. Only four explicitly selected source files are read as raw text at build time, and only bounded excerpts are included in the built page. There is no runtime source-file endpoint. These excerpts are intentionally visible to portal users; do not add secrets or sensitive literals to these selected sections. The page labels live code as unverified and makes no deployment calls.

## Code separation

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features/onboarding/` | React onboarding UI |
| `apps/api/src/modules/native-app/` | Native App listing adapter and independent mock |
| `apps/api/src/modules/data-sharing/` | Filtered secure view, secure share, data listing, independent mock |
| `apps/api/src/lib/distribution.ts` | Shared safe listing manifest/reconciliation helpers |
| `apps/api/src/lib/snowflake.ts` | Official SDK executor with provider key-pair authentication |
| `apps/api/src/services/` | Persistent local jobs, per-binding locks, product-specific retries |
| `packages/contracts/` | Request schemas and shared response types |

The Native App module never imports the data-sharing module, or vice versa. `prepare(binding)` renders operations. `deliver(trustedBinding, publish = false)` is the future provider integration entry point; publication is explicitly separate and opt-in. SDK exceptions are sanitized; inspect provider query history for detailed failures rather than exposing raw Snowflake errors to consumers.

## Safety boundaries

- `SHARING_MODE` accepts `mock`, `dry-run` or `live-test`; anything else (including `live`) prevents startup. Only `live-test` creates the SDK executor (see below).
- Demo identities are chosen from server fixtures and attached to an HttpOnly SameSite session. Clients cannot submit a Unity ID to select another tenant's data.
- Jobs/previews are session-scoped. Session tokens expire after eight hours and are in memory; a server restart requires a fresh session. Job files remain under `.local/`, but old-session jobs are intentionally inaccessible. This local store is single-process, not a production queue or database.
- Non-sensitive account/identity input is retained in browser local storage. Reset clears account input. No consumer credentials are collected.
- The future adapter checks a trusted identity and approved recipient binding. This type guard is not an authentication provider: only trusted server code may construct those bindings.
- Data SQL uses explicit allowed columns and a fixed Unity-ID predicate in a secure view. The backing share receives SELECT only on that view, never the unfiltered source table. Source and sharing schema must currently be in one database; schema provisioning is a provider prerequisite.
- Resource names include a deterministic binding hash. Existing listings/views/shares must match ownership and scope; ambiguous definitions fail closed. No automatic replacement, drop, grant cleanup, or target-list mutation occurs.
- Private manifests disable resharing. No data-preview samples are enabled. Account restrictions are not silently relaxed to accommodate trial consumers.
- Local-only origin checks and HTTP cookies are appropriate for loopback development, not an internet deployment. Before hosting publicly, implement authenticated sessions, secure cookies, deployment-aware origin checks, CSRF defense, durable session/transactional storage, quotas, retention, and operational audit logging.

## Live test mode (private draft listings)

`live-test` runs the real adapters against the provider account and creates two **private** draft listings (Native App and data) targeting the account entered in the portal (`targets.accounts`). Snowflake validates the target, so it must be a real `ORG.ACCOUNT`. Nothing is published from the portal; publish from Provider Studio when ready.

```sh
SHARING_MODE=live-test SNOWFLAKE_CONNECTION_NAME=MainAnthonyAccount SNOWFLAKE_ROLE=ACCOUNTADMIN SNOWFLAKE_WAREHOUSE=DEMO_WH npm run dev
```

- Credentials come from the named entry in `~/.snowflake/connections.toml`; role and warehouse always come from env. Nothing is sent to the browser.
- **Create draft listings** runs the Native App preflight and creates the Unity-filtered view, share (`UNITY_PORTAL_DATA_<hash>_VIEW` / `_SHARE`) and two draft listings. Blocked products can be retried individually; the real Snowflake error is printed only in the API server log. Re-running is idempotent (existing objects are reconciled, not recreated).
- Listing terms default to `STANDARD` (`LISTING_TERMS=OFFLINE` to change).
- Listings are filled with sample content: subtitle, description, access type (`FREE`), business needs, Quick Start examples, category (`MEDIA`), documentation link (`LISTING_DOCUMENTATION_URL`), data attributes and, for data, a data dictionary. Snowflake derives the product type.
- A provider profile is optional for private listings; set `LISTING_PROFILE` only if you want one.
- Fulfillment is manual (no `auto_fulfillment`). Consumers in another region need auto-fulfillment, which this mode does not configure.
- **Delete listings** (shown after a live delivery, with confirmation) unpublishes if needed and drops both listings, then the delivery's share and filtered view. Only objects whose name, owner role and portal comment match are dropped; anything else is refused. Source data and the application package are never touched.
- Prerequisites: the fixtures from `native-app/README.md`.

Cleanup (provider account; names are printed in the delivery list):

```sql
SHOW LISTINGS LIKE 'UNITY_PORTAL_%';
DROP LISTING <APP_LISTING>;
DROP LISTING <DATA_LISTING>;
DROP SHARE <DATA_LISTING>_SHARE;
DROP VIEW UNITY_DATA.PORTAL_SHARING.<DATA_LISTING>_VIEW;
```

Then delete `.local/jobs.json` to reset the portal state.

## Future live integration checklist

Live adapters are **unverified**, disconnected implementation code. Do not enable them by simply removing the demo gate.

1. Integrate trusted Unity authentication and entitlement lookup. Approve the Unity identity-to-consumer-account binding, including consumer ownership verification. Never trust an arbitrary UI identity or URL.
2. Configure a provider account, key-pair service user, dedicated least-privilege role and warehouse. Configure `SNOWFLAKE_*` only on the backend. Confirm the role owns the package/share and has required listing/share/view creation and source access privileges. Do not use the connected Snowhouse account implicitly.
3. Build and independently test the Native App. Configure its existing package, `EXTERNAL` distribution, approved security scan, supported versions, and a ready default release directive. The adapter reads readiness; it never changes package distribution or releases. Validate preflight against actual output, including release channels.
4. Configure real source object, Unity ID column, explicit allowed columns, and an existing destination schema. Confirm the Unity column represents the authenticated entitlement scope and matches intended case/collation. Examine source policies and indirect view dependencies.
5. Review listing metadata and terms. Accept required Customer-Controlled Data Sharing Functionality Terms; configure an approved provider profile where applicable. The current manifest builder is explicitly V1; accounts with V2 listings enabled require a V2 builder before live use.
6. For remote consumers, verify provider auto-fulfillment privileges, supported objects, compatible data schedules and billing implications. Data uses `SUB_DATABASE` with a configured interval; application packages use `SUB_DATABASE_WITH_REFERENCE_USAGE` and account-level schedules. No global account setting is changed by this code. Referenced tables can be replicated to Snowflake-managed secure share areas even though consumers only receive the filtered view; review this against data residency requirements.
7. Test SQL compilation and execution in a dedicated provider/consumer sandbox. Inspect actual SHOW/GET_DDL output and collision reconciliation. Strict GET_DDL comparison deliberately blocks if Snowflake normalizes a definition differently. Confirm no additional objects or recipients are exposed and test partial execution/retry recovery.
8. Add cross-process locks/transactions and a durable job ledger before wiring the live adapters. Review each exact operation, create drafts first, and approve publication separately.

### Consumer steps after future live delivery

In the recipient Snowflake account, locate the two private listings in External Sharing, accept their terms, install the Native App, and create a database from the data listing. Cross-region fulfillment may be asynchronous. Listing publication is not proof of completed fulfillment or installation. How the future Native App consumes the separately mounted data is not implemented because the Native App does not exist yet.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover normalization, malicious input, identity isolation, safe SQL/manifests, separate adapter preflight, collision checks, restricted grants, deduplication, persistence, partial failure and retries. Browser tests cover the actual onboarding, signup link, retained input, failure/retry, SQL preview, mobile overflow, and request boundaries. No live Snowflake SQL is executed by these tests.

Official references: [account identifiers](https://docs.snowflake.com/en/user-guide/admin-account-identifier), [listing manifests](https://docs.snowflake.com/en/progaccess/listing-manifest-reference), [listing SQL](https://docs.snowflake.com/en/progaccess/listing-progaccess-about), [auto-fulfillment](https://docs.snowflake.com/en/collaboration/provider-understand-auto-fulfillment-objects).