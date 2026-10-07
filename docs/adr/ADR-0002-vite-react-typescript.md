# ADR-0002: Vite + React 19 + TypeScript (no Next.js)

**Date:** 2026-10-07
**Status:** Accepted
**Deciders:** Sofia, Yeison (Backend alignment)

## Context

The COLBITS frontend is a monitoring dashboard. The choice is between:
a) Next.js (SSR/SSG) — adds server rendering complexity
b) Vite + React SPA — pure client-side, simpler deployment

## Decision

Use **Vite + React 19 as a pure SPA**. No SSR.

Reasons:
- COLBITS is a real-time dashboard — page content is user-specific and data-driven, so SSR/SSG provides no SEO or performance benefit
- Backend is a separate Spring Boot API; no Next.js server layer needed
- Team is more familiar with Vite's toolchain
- Simpler deployment: build outputs static files that can be served from any CDN or static host

## Consequences

- No server-side rendering, no file-based routing
- All routing is handled by React Router v7 on the client
- Build produces `dist/` with static assets — deploy to any static host or behind the Spring Boot server
