# Action Assignment Notifications

> PORTOS / 09-workflows / 03_action_assignment_notifications  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make assignments and communication workflows tangible but safely sandboxed.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Supported actions: assign incident to a demo coordinator, create port-agent ETA follow-up, add voyage monitoring task, draft customer status update, mark task done, request additional evidence. Use simple forms and in-place validation.
- Each action has status draft/open/in_progress/done/cancelled, assignee, createdBy, dueAtUtc?, relatedEntities, notes, timestamps, priority and source. User can open task from vessel, incident and port views.
- Customer notification is only a preview/draft in frontend prototype. UI says `Draft prepared locally`; no Send button unless actual mail integration exists, and no fictional success toast.
- Trigger a visible but unobtrusive task list count and map-linked incident action badge when task created. Filter outstanding actions by role and region; deep link returns to entity focus.
- Confirmations and failure states matter: invalid assignee, expired due time, missing permissions, no content and storage quota must all be handled.
- When task resolves, associated incident may remain open until separately verified; do not auto-close failures because a message draft was saved.
- Simulated stakeholders include owner, port-agent coordinator, fleet ops dispatcher and customer-service rep. Names and contacts are fictitious; no personal real-data claims.


## Interface / data contracts

- `Task` {taskId,relatedIncidentId?,voyageId?,portId?,type,status,assigneeUserId,createdByUserId,dueAtUtc,notes,createdAtUtc,updatedAtUtc}.
- `NotificationDraft` {draftId,recipientRole,subject,body,relatedEntityIds,createdAtUtc}.


## Interaction and system states

- Browser storage blocked: show ephemeral task state and warning.
- Draft with no permitted recipient role: cannot mark ready.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Create/assign/complete task; navigation and reload preserve consistent task state.
- No UI asserts real messages were sent.


## Build instructions for Codex

1. Find the closest existing implementation before creating a new component; preserve the original Three Scope Map renderer and its GPL attribution when reusing code.
2. Define TypeScript types, JSON inputs and deterministic selectors; add unit tests for calculations and event transitions before connecting visual elements.
3. Connect semantic design tokens from `02-design-system` and render controlled loading, empty and error states.
4. Verify interactions with the real running app in a browser, including camera, selection, layer and deep-link transitions when applicable.
5. Update `docs/BUILD_LOG.md` with implemented files, verification commands, screenshot evidence, known limitations, and next work.

## Explicit non-goals / safety

- The build is an illustrative offline maritime command-center prototype; it is **not an AIS service, certified nautical chart, vessel routing advisory or safety-critical operating system**.
- Never imply simulated data is actual live vessel telemetry. Use labeled source and as-of date on every operational estimate.
- No inert primary buttons, nonfunctional simulated controls, screenshot replacement maps, or inconsistent numbers across screens.
- Respect GPL-3.0-or-later source conditions of the original map skill and map/texture data licensing.

## References and order

- Prerequisites: `instructions/09-workflows/02_operational_alternative_comparison.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/09-workflows/04_audit_trail_and_handoffs.md`
