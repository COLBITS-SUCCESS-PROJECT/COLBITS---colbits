# Live updates: polling every 15 seconds

**Date:** 2026-10-27  
**Status:** Accepted  
**Decision owners:** Mahmoud (backend) · Paola (Product Owner)  
**Answers:** OQ-03 in [`AGENT.md §20`](../../AGENT.md) · Story: [SCRUM-110](../specs/dashboard/SCRUM-110.md)

## Decision

The map gets the node states by asking `GET /nodes` every **15 seconds** while the page is open. We do not use WebSockets or server-sent events.

## Why

- NF-01 allows **20 seconds** from the record in the database to the change on the map. Waiting at most 15 s for the next request, plus the request itself, fits.
- The backend already computes each node's state **on every request**, from the last record of each device and the current time (`backend/src/nodes/nodes.service.ts`). A new record (F-25) and a device that goes silent (F-26) show up on the next request with no backend change.
- Polling works with the current HTTP client and token handling. A WebSocket would need a new server channel, reconnection handling and its own scope checks (F-10).

## Consequences

- Each open map makes one `GET /nodes` request every 15 s. With a few users and 50 nodes the load is negligible; revisit if Colbits has many users at once or a much larger network.
- On Render's free plan the API does not fall asleep while someone has the map open.
- The interval is one constant, `LIVE_REFETCH_INTERVAL_MS` in `src/features/dashboard/model/liveMonitoring.constants.ts`. Any new value must keep NF-01: interval + request time under 20 s.
