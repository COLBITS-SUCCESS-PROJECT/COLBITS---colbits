---
feature: chatbot
title: Assistant (chatbot)
status: PLANNED
owner: TBD
last_updated: 2026-10-07
---

# Feature: Assistant (chatbot)

## 1. Purpose
A floating assistant available on every page where users can ask questions about the network data in natural language. The frontend only renders the conversation; the intelligence lives in the backend (`AGENT.md §0` — no LLM calls in the frontend).

## 2. Scope

### In scope
- Floating action button (FAB) on every page
- Chat window with bot and user message bubbles

### Out of scope
- Any AI / LLM processing (backend)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| — | Add one row per Jira story when it enters a sprint | — | — |

## 4. Design (Figma)
Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Frame | node-id |
|---|---|
| Chatbot FAB | `5-378` |
| Chatbot Window | `5-384` |
| Chat Bubble (molecule) | `3-340` |

## 5. Routes
None — the assistant is mounted once inside `AppShell` and floats over every page.

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `ChatBubble`, `ChatbotFab`, `ChatbotWindow` | Molecule / organism | feature |

## 7. API contract (PROVISIONAL)
Not defined yet — pending backend OpenAPI (OQ-02).

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | Is the assistant in scope for the Alpha / Beta milestones? | Paola (PO) | OPEN | — |
| Q2 | Streaming responses or one reply per message? | Backend team | OPEN | — |
