# ADR-0003: Custom fetch wrapper over axios

**Date:** 2026-10-07
**Status:** Accepted
**Deciders:** Sofia

## Context

We need an HTTP client that handles auth token injection, error normalization, and timeouts. Options: axios (popular, feature-rich) or a custom wrapper over native `fetch`.

## Decision

Use a thin custom wrapper over native `fetch` (`src/services/http/httpClient.ts`). No axios.

Reasons:
- `fetch` is native in all target browsers — no extra bundle weight (~30 KB gzipped for axios)
- We only need: auth header injection, Accept-Language header, 10-second timeout, 401 handler, and structured error mapping
- A 100-line custom wrapper is easier to understand and debug than axios interceptors
- TanStack Query already handles retries and caching — we don't need axios for that

## Consequences

- Must implement AbortController for timeouts manually (done in httpClient.ts)
- No axios-specific plugins (not needed for our use case)
- Any new cross-cutting HTTP concern must be added to httpClient.ts and reviewed by the team
