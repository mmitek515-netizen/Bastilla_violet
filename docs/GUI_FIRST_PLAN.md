# GUI-first plan — BastillaOS

User priority: **GUI and visual design first; AI-based system improvement later**.

## Core interface

- One full-width ChatGPT Work-like conversation view; agents write independently
  to the operator and each other, with distinct avatars, in a durable transcript.
- Real message lifecycle: queued, running, streamed chunks, completed/failed.
  No hardcoded "working", "root online" or fake health indicators.
- Fewer permanent buttons: Chat / Terminal / AI, all other modules in nested
  categories; desktop expands context panes only when requested.
- Mobile-first: swipe gestures, long press for actions, pull-down for context,
  smooth chat history and new-chat gesture. Never steal native scrolling.
- Purple accent/saber; settings for user and agent avatars (file, URL or
  generated artwork), accessible contrast, animation reduced-motion option.
- Interactivity is real React UI: charts, systemd status, tasks, file browser,
  terminal output, status and approvals. Do not substitute generated mockups.
- Preserve the working backend routes, existing modules and deep-link IDs.

## Later AI enhancement phase

Per-agent service processes, correct Linux UIDs, model/vision tools, shared
knowledge, MCP tools, autonomous repair jobs with execution logs, tests and
rollback. Privilege use must be attributable to an individual agent. Full root
sudo is a separate operator-enabled configuration.

## Acceptance

Test keyboard/mouse and Android touchscreen, small viewport, large viewport,
empty chat, 100+ messages, image attachments, failed backend and offline mode.
Statuses must reflect real API responses, not local assumptions.
