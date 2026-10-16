# ADR-0006: Leaflet + OpenStreetMap for the network map

**Date:** 2026-10-10
**Status:** Accepted
**Deciders:** Sofia

## Context

Requirement F-12 asks to display every node in the user's scope as a marker **at its recorded coordinates**. The base screen (SCRUM-128) used the static placeholder image from Figma with positions in percent, which cannot place a real latitude / longitude. The Figma frame itself is named *"Map Canvas (basemap placeholder)"*, so the design expects a real map.

The map must also support, in later stories: clustering of overlapping markers (F-13), custom markers per layer and state (F-14 to F-24), centering on a node (F-34, F-35) and marker updates without reloading (F-30).

Options considered:

| Option | Cost / key | Notes |
|---|---|---|
| **Leaflet + OpenStreetMap tiles** | Free, no API key | Small (~42 KB gzipped), most widely used, mature clustering plugin (`leaflet.markercluster`), HTML markers via `divIcon` |
| MapLibre GL | Free, no API key | Vector maps, smoother with many thousands of markers, but heavier (~200 KB) and needs a style / tile source to be configured |
| Google Maps | API key with billing | Familiar basemap, but requires a credit card and has per-use cost — not acceptable for a course project |

## Decision

Use **Leaflet** with **OpenStreetMap** raster tiles, through **react-leaflet** for the React bindings.

Reasons:
- Free and without an API key or account: anyone can clone the repo and run it (also inside Docker).
- Covers every map requirement in the backlog with stable, documented features.
- `divIcon` lets us keep the Figma marker design (our own `MapMarker` component) instead of image pins.
- The expected volume (nodes within one user's scope) is well within what Leaflet handles, especially with clustering.

## Consequences

- New dependencies: `leaflet`, `react-leaflet`, `@types/leaflet` (dev).
- Leaflet ships its own CSS; it is imported once where the map component lives.
- The map needs internet access to load OpenStreetMap tiles. OSM's tile usage policy applies: attribution must stay visible, and heavy production traffic would need a dedicated tile provider — to be revisited with Colbits before a real deployment.
- Map code stays inside the `dashboard` feature (`MapCanvas`); no other component imports Leaflet directly, so the library can be replaced by changing that organism.
- Unit tests run in jsdom, which has no real layout: map tests assert on markers and their coordinates, not on pixels. Visual checks are manual (recorded in the story spec).
- If the node count grows to tens of thousands or vector styling is required, MapLibre GL is the upgrade path (new ADR).
