# Responsive design baseline

**Date:** 2026-10-18  
**Status:** Accepted  
**Decision owner:** Product / frontend team

## Decision

- Support a minimum viewport width of **360 CSS px** for the current frontend.
- At widths below 768 px, signed-in navigation is presented as a dismissible drawer.
- On the live-monitoring dashboard, the map remains the primary mobile surface. The fault panel opens as a bottom sheet over the map and can be dismissed from its close control or the scrim.
- Location filters collapse behind a filter control below 1536 px (`2xl`), and the mobile map legend starts as a color key that expands to labels on demand.
- Map layers and filters reflow on narrow screens. The fault panel returns to a persistent side panel from 1280 px (`xl`) upward.
- The login layout stacks its branding and form on small screens and uses a split layout at `md` and above.

## Verification widths

Check the current screens at 360 px, 390 px, 768 px, 1024 px, 1280 px, and 1440 px, including portrait and landscape where practical. Verify that controls remain reachable, the map resizes with its container, and pages do not scroll horizontally.

## Consequences

- Mobile operators can inspect the map without permanently giving up map width to the fault list.
- The mobile drawer and bottom sheet must expose clear accessible names and close actions.
- Add or update this decision if product support minimums or responsive behavior changes.
