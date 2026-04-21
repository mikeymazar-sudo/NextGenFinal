---
name: frontend-skill
description: Use when the task needs general frontend implementation support for app surfaces, layouts, interaction flows, and responsive behavior. This helper provides shared frontend working habits, but repo-specific decisions must defer to ui-consistency-guardrails.
---

# Frontend Skill

Use this helper for general frontend implementation support.

If the work touches protected-shell product UI in this repo, read `../ui-consistency-guardrails/SKILL.md` first and treat that skill as the source of truth for layout, component usage, terminology, and state handling.

## Working mode

- Start by identifying the primary working surface, secondary context, and the one action the user should take next.
- Prefer utility copy over marketing copy on application screens.
- Keep layouts readable before adding visual treatment.
- Preserve existing component patterns unless the repo-specific guardrails explicitly call for a new pattern.

## Defaults

- Build around clear hierarchy, not decorative chrome.
- Prefer sections and layout regions over unnecessary nested cards.
- Keep forms short, progressive, and explicit about side effects.
- Make loading, empty, success, failure, and disabled states visible and understandable.
- Validate desktop and mobile behavior before considering a UI task done.

## Output checks

- Can the page be understood by scanning headings and primary actions?
- Is there one primary task surface instead of many competing panels?
- Does the page stay usable on smaller screens without horizontal overflow?
- Are action labels concrete and operational?
