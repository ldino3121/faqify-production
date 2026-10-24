# OpenRouter consumer audit

Inspected 2026-10-23. Branch: `integration/paddle-sandbox`. Read-only remote inspection; no exposed credential was displayed or used for authentication. No revocation, configuration change, function invocation, deployment, commit or push.

## Findings

**No active OpenRouter consumer was confirmed in the inspected FAQify scope. This does not establish that the exposed key is unused account-wide.**

- Confirmed production project: `dlzshcshqjdghmtzlbma`. Existing Supabase management authentication was used to download all 25 deployed functions (34 source/configuration files), including remote-only diagnostics. No OpenRouter name, key-prefix marker, or exact match to historical exposed OpenRouter literals was found. The deployed generation entrypoint is `analyze-content`, version 45. Older bundle downloads required the CLI Docker extraction fallback; all ultimately succeeded. Functions were not invoked.
- Supabase secret-name inventory contains no `OPENROUTER_API_KEY`.
- Read-only database metadata checks found one active cron job, with no OpenRouter, HTTP-call or `analyze-content` marker. No OpenRouter markers were found in stored routine bodies or trigger arguments; zero Vault secret names reference OpenRouter. No user records, raw cron commands, Vault values or HTTP headers were returned. Indirect/dynamically constructed references remain a limitation of this scan.
- GitHub public `main` contains one workflow, `.github/workflows/ci.yml`, with no schedule or OpenRouter marker. Its `vercel.json` has zero cron definitions and no OpenRouter marker. These are repository observations, not verified Vercel deployment settings.
- This Mac has no current-user crontab. Twelve readable launch-agent/daemon property lists across user and system directories contain no FAQify/OpenRouter marker. Scripts launched indirectly, other users' crontabs, and other machines were not exhaustively traced.
- The current local `deploy-permanent-api-fix.js` reads `OPENROUTER_API_KEY` for optional secret installation with `--apply`. It is a historical configuration writer, not a confirmed running inference consumer, and was not executed. Historical documentation contains exposure evidence, not proof of runtime use.

## Unavailable evidence

No authenticated OpenRouter account/management access, GitHub administration access or Vercel integration/CLI session was available. Therefore the exposed key's identity/status, activity, last use, workspace membership, external consumers and billing usage could not be verified. Vercel deployed artifacts, environment names/branch overrides and remote cron configuration, plus GitHub organization/repository/environment secrets, other branches and private automation, remain unverified. Other Supabase projects, third-party automation, external servers and personal applications are outside this audit. No newly supplied credentials are needed in chat.

## Owner dashboard procedure (future action only)

1. Sign in to https://openrouter.ai/settings/keys with the owning account. Select the relevant personal account or organization/workspace; repeat across possible owning workspaces. Identify the exposed entry privately using its masked identifier/label, name, creation metadata and existing incident evidence. A matching name alone is insufficient. Do not paste a full key into chat or try it against an endpoint. If identification remains ambiguous, stop and resolve ownership with the account administrator or OpenRouter support.
2. Open https://openrouter.ai/activity in the same account/workspace. Filter by the identified API key and use the widest relevant available date range. Review request counts, dates, models, costs and any application attribution privately. Correlate activity with known job/deployment times and owners; a model or app label alone cannot prove the caller's identity. No recent activity does not exclude dormant consumers or usage outside retention.
3. Check Vercel project Settings → Environment Variables (Production, Preview and overrides) and Cron Jobs; GitHub Settings → Secrets and variables → Actions, Environments and organization secrets; and any automation/server secret stores for OpenRouter configuration names. Do not reveal values. Confirm each consumer owner before deciding continuity requirements.
4. If a legitimate consumer exists, arrange its replacement credential, switch/reload it and validate only the replacement under separate authorization before revocation. No OpenRouter replacement is indicated for the inspected FAQify functions.
5. When revocation is authorized, return to Keys, locate that same identified entry, use its delete action and confirm deletion. Refresh the list and verify removal/provider confirmation; record only the non-secret identifier and time. Do not test the old key. The exact action icon/dialog wording could not be verified without an authenticated dashboard session.

Official references: [Activity filtering](https://openrouter.ai/blog/tutorials/team-spend-controls-setup/), [key metadata and workspace filtering](https://openrouter.ai/docs/api/api-reference/api-keys/list), [deletion semantics](https://openrouter.ai/docs/api/api-reference/api-keys/delete-keys).

## Private evidence

Captured deployed source and safe summaries are outside Git at:
`/Users/carbonface/Backups/faqify/dlzshcshqjdghmtzlbma/openrouter-audit-20261023T144049Z`

Directories have mode 700; files have mode 600. Treat all captured source/logs as private. Only aggregate/name-only findings are recorded here. This report supplements the historical inspection limits in `CREDENTIAL_ROTATION_CHECKLIST.md`; it does not complete the separate Supabase/Google rotation audits.
