#!/usr/bin/env bash
# Posts a PostHog annotation marking a deploy, so dashboards (e.g. the
# deployment-health dashboard) show exactly when a release went out —
# letting a metric spike be visually correlated with the deploy that caused it.
#
# Requires POSTHOG_PERSONAL_API_KEY (a personal API key, not the public project
# token in main.ts) in the environment. Missing key = skip, not fail, so this
# never blocks a deploy or CI run over a missing secret.
#
# Usage: POSTHOG_PERSONAL_API_KEY=... ./scripts/post-posthog-deploy-annotation.sh <sha> <environment>

set -euo pipefail

SHA="${1:?usage: post-posthog-deploy-annotation.sh <sha> <environment>}"
DEPLOY_ENV="${2:?usage: post-posthog-deploy-annotation.sh <sha> <environment>}"

# Default PostHog project — see posthog-setup-report.md / CLAUDE.md context.
POSTHOG_PROJECT_ID="${POSTHOG_PROJECT_ID:-476486}"
POSTHOG_HOST="${POSTHOG_HOST:-https://us.posthog.com}"

if [ -z "${POSTHOG_PERSONAL_API_KEY:-}" ]; then
  echo "POSTHOG_PERSONAL_API_KEY not set — skipping deploy annotation."
  exit 0
fi

DATE_MARKER="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X POST "${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/annotations/" \
  -H "Authorization: Bearer ${POSTHOG_PERSONAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"content": "Deploy %s (%s)", "date_marker": "%s", "scope": "organization"}' \
        "${SHA}" "${DEPLOY_ENV}" "${DATE_MARKER}")" \
  && echo "Posted PostHog deploy annotation for ${SHA} (${DEPLOY_ENV})."
