# Design System — component catalog

**Before you build a component, search this page.** If something similar exists, use it or extend it with a prop — don't create a second version.

Everything here mirrors the Figma file **COLBITS Mockups v3** → page **1 Design System (Atoms · Molecules · Organisms)**:
<https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=4-97>
Full screens built from these pieces are on page **2 Templates & Pages**.

```ts
import { Button, Icon, Badge } from '@/design-system/atoms'
import { Select, Tabs, DataField } from '@/design-system/molecules'
import { TopBar, NavSidebar } from '@/design-system/organisms'
```

## Rules (summary of AGENT.md §4)

| Layer           | May use              | Never                           |
| --------------- | -------------------- | ------------------------------- |
| Atom            | other atoms (`Icon`) | i18n, API, stores, domain words |
| Molecule        | atoms, molecules     | i18n, API, stores, domain words |
| Organism (here) | atoms, molecules     | API calls, domain logic         |

- All text and accessible names come in **through props** — the feature passes `t('…')`.
- Colors only through tokens (`bg-action-primary`, `text-text-subtle`…) — see `src/styles/semantic.css`.
- Component used by **one** feature only → `src/features/<name>/components/`. Used by **two or more** → move it here.
- Small controls keep the Figma size and add the `touch-target` class (44 px click area, AGENT.md §16).

## Tokens — never write raw values

No hex/rgb colors and no `[13px]`-style arbitrary values in components. Use these (defined in `src/styles/`):

| Need                     | Use                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colors                   | `text-text-heading · text-text-primary · text-text-secondary · text-text-subtle · text-text-muted`, `bg-bg-surface · bg-bg-panel · bg-bg-page`, `bg-action-primary`, `bg-status-critical/warning/online/offline`, `border-border-default/strong`… (full list in `semantic.css`) |
| Small font sizes         | `text-micro` (10px) · `text-overline` (11px) · `text-xs` (12px) · `text-label` (13px) · `text-sm` (14px) · `text-base` (16px) · `text-xl` (20px) · `text-2xl` (24px)                                                                                                            |
| Uppercase captions       | `uppercase tracking-caps`                                                                                                                                                                                                                                                       |
| Radius                   | `rounded` (4) · `rounded-tile` (5) · `rounded-lg` (8) · `rounded-card` (10) · `rounded-full`                                                                                                                                                                                    |
| Shadows                  | `shadow-marker` · `shadow-cluster` · `shadow-card`                                                                                                                                                                                                                              |
| Spacing / sizes          | Tailwind scale (4pt grid = Figma): `w-37.5` = 150px, `py-1.75` = 7px, `size-4.5` = 18px                                                                                                                                                                                         |
| Small clickable controls | `touch-target` (keeps Figma size, 44px click area)                                                                                                                                                                                                                              |

---

## Atoms — `atoms/`

| Component    | Figma                    | Use it for                                                                                                                                     | Key props                                                                                      |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Icon`       | Iconography              | Every icon. **Never import `lucide-react` directly.** Names = Figma names (`map`, `fuse`, `transformer`, `alert`…) — list in `iconRegistry.ts` | `name`, `size` (`xs 14 · sm 16 · md 18 · lg 20 · xl 24`), `label`                              |
| `Button`     | Button                   | Actions with text                                                                                                                              | `label`, `variant` (`primary · secondary · outline · ghost · danger`), `iconLeft`, `isLoading` |
| `IconButton` | Icon Button              | Square icon-only actions (bell, layers)                                                                                                        | `icon`, `label`, `isActive`                                                                    |
| `ToggleChip` | Layer Toggle, Range Chip | Pill that turns on/off (map layers, "Last hour / Last day")                                                                                    | `label`, `isActive`, `icon`                                                                    |
| `Input`      | Input                    | Text fields (use inside a form field)                                                                                                          | native input props + `hasError`                                                                |
| `Label`      | Input → Label            | Form labels                                                                                                                                    | `text`, `isRequired`                                                                           |
| `Checkbox`   | Checkbox                 | Checked / partial selection (scope tree)                                                                                                       | native props + `isIndeterminate`                                                               |
| `Toggle`     | Toggle                   | On/off switch                                                                                                                                  | `isOn`, `onChange`, `label`                                                                    |
| `Badge`      | Badge                    | Status pills (phase type, Open / Resolved, Inactive)                                                                                           | `label`, `tone` (`neutral · info · success · warning · danger`), `isOutlined`                  |
| `StatusDot`  | Status Dot               | Red / yellow / gray / green state dot                                                                                                          | `status` (`critical · warning · offline · online · unknown`), `label`                          |
| `Avatar`     | Avatar                   | User photo or initials                                                                                                                         | `name`, `imageUrl`                                                                             |
| `Tooltip`    | Tooltip                  | Hint on hover / focus of a button                                                                                                              | `label`, `placement`, one focusable child                                                      |
| `Spinner`    | —                        | Loading indicator                                                                                                                              | `label`, `size`                                                                                |
| `Skeleton`   | —                        | Placeholder while loading                                                                                                                      | `shape` (`text · rect · circle`), `className` for size                                         |
| `Logo`       | Logo · Light             | White Colbits wordmark on navy                                                                                                                 | `label`, `size` (`md` sidebar · `lg` login panel)                                              |

## Molecules — `molecules/`

| Component          | Figma                 | Use it for                                                                                                   | Key props                                                                    |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `NavItem`          | Nav Item              | Sidebar link, highlights itself on the current route                                                         | `to`, `label`, `icon`                                                        |
| `LanguageSwitch`   | — (SCRUM-158)         | One-click toggle pill (ES \| EN, active one filled); labels come by props                                     | `options`, `value`, `onChange`, `label`                                      |
| `UserSummary`      | Sidebar → User        | Avatar + name + role + logout (navy background)                                                              | `name`, `roleLabel`, `onLogout`                                              |
| `Select`           | Select                | Labelled dropdown (zone / substation / circuit, any filter)                                                  | `label`, `options`, native select props                                      |
| `SearchField`      | Search Field          | Search box with icon                                                                                         | `label` (accessible), native input props                                     |
| `FormField`        | Input → Label / Error | Labelled input with its error message, linked for screen readers. Works with `register()` of react-hook-form | `label`, `error`, `isRequired`, native input props                           |
| `Tabs`             | Tab                   | Underlined tabs with arrow-key navigation                                                                    | `items`, `activeId`, `onChange`, `idPrefix` — panel id via `getTabPanelId()` |
| `LegendItem`       | Legend Item           | Dot + meaning in a legend                                                                                    | `status`, `label`                                                            |
| `RefreshTimestamp` | Refresh Timestamp     | "Last update" pill with live / stale dot and refresh                                                         | `label`, `isStale`, `statusLabel`, `onRefresh`                               |
| `CounterCard`      | Fault Counter Card    | Big number with accent bar and caption                                                                       | `value`, `label`, `tone` (`primary · info · warning · critical`)             |
| `DataField`        | Fault List Item cells | Uppercase caption + value; shows "—" when empty. Inside a `<dl>`                                             | `label`, `value`                                                             |

## Organisms — `organisms/`

| Component    | Figma          | Use it for                                                                   |
| ------------ | -------------- | ---------------------------------------------------------------------------- |
| `NavSidebar` | Sidebar (navy) | The app sidebar — already mounted by `layouts/AppShell`                      |
| `TopBar`     | Top Bar        | Page title + data freshness + avatar — already mounted by `layouts/AppShell` |

`layouts/AppShell` = Figma **Template / App Shell** (Sidebar + Top Bar + content slot). Your page only renders the content.

---

## Not built yet (check Jira SCRUM-128 before starting one)

| Figma component                                                | Layer                | Where it should live                  |
| -------------------------------------------------------------- | -------------------- | ------------------------------------- |
| Banner / Alert (Stale · Filter active · Info)                  | Molecule             | design-system                         |
| KPI Card                                                       | Molecule             | design-system (`analysis`, `reports`) |
| Scope Tag, Scope Tree Row                                      | Molecule             | design-system (`analysis`, `users`)   |
| Level Bar                                                      | Atom (`ProgressBar`) | design-system                         |
| Telemetry Row, Fuse Row, Fuse Group Card, Inactive Device Card | Molecule / organism  | feature `dashboard`                   |
| Chat Bubble, Chatbot FAB, Chatbot Window                       | Molecule / organism  | feature `chatbot`                     |
| Period & Scope Selector                                        | Organism             | design-system (`analysis`, `reports`) |
| Chart Card, Ranking Table                                      | Organism             | feature `analysis`                    |

When you build one: add it here, export it from the layer's `index.ts`, write its test, and tick it in Jira.
