#!/usr/bin/env bash
# Netlify "ignore" check: exit 1 = build, exit 0 = skip (skipped builds cost no credits).
# Builds only when the Publish button (a build hook) asks, or when a commit
# message contains [publish].
if [ -n "${INCOMING_HOOK_URL:-}" ]; then
  echo "Publish button pressed: building."
  exit 1
fi
if git log -1 --pretty=%B "${COMMIT_REF:-HEAD}" 2>/dev/null | grep -qi '\[publish\]'; then
  echo "Commit asks for [publish]: building."
  exit 1
fi
echo "Saved, not published: skipping build. Press Publish at /admin/publish/ to go live."
exit 0
