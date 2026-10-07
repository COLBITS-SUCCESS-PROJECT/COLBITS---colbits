# ADR-0001: Use Atomic Design for component organization

**Date:** 2026-10-07
**Status:** Accepted
**Deciders:** Sofia (Frontend Lead), Monica, Paola

## Context

The COLBITS frontend will be built by three developers across two timezones (Colombia and Panama). Without a shared mental model for component organization, each developer will create components at inconsistent levels of abstraction, leading to duplication, inconsistent styling, and merge conflicts.

The project involves a data-heavy IoT dashboard with many repeating UI patterns (stat cards, charts, status badges, tables) that benefit from a layered composition model.

## Decision

Adopt **Atomic Design** with four layers mapped to our directory structure:
- `design-system/atoms/` — primitive, single-purpose elements
- `design-system/molecules/` — composed from 2–5 atoms
- `design-system/organisms/` — complex sections shared across features
- `features/<name>/components/` — feature-specific organisms and molecules

A component moves up to `design-system/` when it is needed by a second feature.

## Consequences

**Easier:**
- Clear answer to "where does this component live?"
- Shared styling and accessibility properties baked into atoms once
- Feature developers can combine building blocks without styling from scratch

**Harder:**
- First time building a component, it may seem like extra ceremony (atom → molecule → organism)
- Requires discipline to not skip layers or duplicate components

**Rules enforced by tooling:**
- `eslint-plugin-boundaries` prevents `design-system/` from importing from `features/`
- File size limits (§3.1 of agent.md) enforce splitting
