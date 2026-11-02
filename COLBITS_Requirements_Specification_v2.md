
## Document prepared by the team


## COLBITS Platform – Requirements Specification

Platform for visualization, alerting and intelligent querying of time-series data for IoT electrical grids Version 2.0 · 18 October 2026 · GDSD 2026–27

## About this document

This document states the requirements of the COLBITS platform using the template of the course requirements guide. Every requirement traces to the Colbits specification, except those whose source is Team.

Version 2.0 applies the corrections from the client review to F-27, F-41, F-56, F-58, F-62 and F-72, and adds F-99 (interface language).

## Overview

| Section | IDs | Requirements |
| --- | --- | --- |
| 1.1 Authentication, roles and data scope | F-01 to F-11 | 11 |
| 1.2 Map and node state | F-12 to F-35 | 24 |
| 1.3 Device inactivity | F-36 to F-46 | 11 |
| 1.4 Alarms and fault classification | F-47 to F-58 | 12 |
| 1.5 Alarm state | F-59 to F-63 | 5 |
| 1.6 Historical analysis and indicators | F-64 to F-75 | 12 |
| 1.7 Export and reports | F-76 to F-80 | 5 |
| 1.8 Conversational assistant | F-81 to F-89 | 9 |
| 1.9 Synthetic data generator | F-90 to F-98 | 9 |
| 1.10 Interface language | F-99 | 1 |
| 2 Non-functional requirements | NF-01 to NF-21 | 21 |


## 1. Functional requirements

## 1.1 Authentication, roles and data scope

F-01 to F-11

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | When a user submits a valid username and password, the system shall authenticate the user and issue an access token. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Only registered users can enter the platform. | Validated High |   | Acceptance test |
| F-02 | If a request to any API service does not carry a valid access token, then the system shall reject it without returning data. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires every API service to be protected, not only the login screen. | Validated High |   | Security test |
| F-03 | The system shall provide two roles: Colbits administrator and consultation user. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Separates who manages access from who only consults data. | Validated High |   | Inspection |
| F-04 | While a Colbits administrator is logged in, the system shall show the entire network without scope restriction. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits staff need the complete picture of the network they operate. | Validated High |   | Acceptance test |
| F-05 | The system shall allow only the Colbits administrator to create, modify and deactivate users and to assign their scope. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Access decisions stay with Colbits. | Validated High |   | Security test |
| F-06 | While a consultation user is logged in, the system shall restrict that user to read-only access and reject any change to states or assignments. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Consultation users must not alter the system's state or anyone's scope. | Validated High |   | Acceptance test |
| F-07 | When a Colbits administrator submits the details of a new consultation user, the system shall create the account with its own data scope. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits must be able to provision several clients and control exactly what each one sees. | Validated High |   | Acceptance test |
| F-08 | The system shall allow a consultation user's scope to be assigned by zone, substation, circuit, node or individual device. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Access can match each client's part of the network at any level of the hierarchy. | Validated High |   | Acceptance test |
| F-09 | The system shall allow the same zone, substation, circuit, node or device to be assigned to more than one consultation user. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | One area of the network may concern several users. | Validated High |   | Acceptance test |
| F-10 | While a consultation user is authenticated, the system shall return, on every service, data, counts and aggregates only for the elements within that user's scope. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Prevents access to out-of- scope devices, including through totals and aggregates. | Validated High |   | Security test |
| F-11 | When a user selects the logout option, the system shall invalidate the authentication token and return to the login page. | Functional | Team | Nobody else can use an unattended, open session. | Validated High |   | Acceptance test |


## 1.2 Map and node state

F-12 to F-35

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-12 | The system shall display each node within the user's scope as a marker on the map, at the node's recorded coordinates. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The node is the unit operators reason about in the field. | Validated High |   | Acceptance test on the database copy |
| F-13 | While two or more node markers overlap at the current zoom level, the system shall group them into a single cluster marker. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Keeps the map readable when many poles sit close together. | Validated High |   | Acceptance test |
| F-14 | The system shall provide a fuse layer and a transformer layer that the user can show or hide independently of each other. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Fuse and transformer states follow different rules, so each needs its own view. | Validated High |   | Acceptance test |
| F-15 | While at least one fuse on a node is open, the system shall show the node in red on the fuse layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | An open fuse means clients without service, so it takes precedence over every other state. | Validated High |   | Acceptance test |
| F-16 | While no fuse on a node is open and at least one fuse is without voltage, the system shall show the node in yellow on the fuse layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Loss of voltage is the next most serious condition after an open fuse. | Validated High |   | Acceptance test |
| F-17 | While no fuse on a node is open, none is without voltage, and at least one Falcon on the node is inactive, the system shall show the node in gray on the fuse layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Missing data must never look like a healthy network. | Validated High |   | Acceptance test |
| F-18 | While every Falcon on a node has a record within its inactivity period, with its fuse closed and with voltage, the system shall show the node in green on the fuse layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Green must mean confirmed normal operation, not just the absence of alarms. | Validated High |   | Acceptance test |
| F-19 | While two or more phases of a node's transformer are down, the system shall show the node in red on the transformer layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Two or more phases down is the most severe transformer condition. | Validated High |   | Acceptance test |
| F-20 | While exactly one phase of a node's transformer is down, the system shall show the node in yellow on the transformer layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A single phase down is a partial failure that still needs attention. | Validated High |   | Acceptance test |
| F-21 | While no phase of a node's transformer is down and its SMAC is inactive, the system shall show the node in gray on the transformer layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Missing data must never look like a healthy transformer. | Validated High |   | Acceptance test |
| F-22 | While no phase of a node's transformer is down and its SMAC is active, the system shall show the node in green on the transformer layer. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Green means the transformer is reporting and all its phases are up. | Validated High |   | Acceptance test |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-23 | The system shall count only the phases a transformer actually has when it applies the transformer-layer rules. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A two-phase transformer with both phases down must show red, and a phase it does not have must never count as down. | Validated High |   | Acceptance test |
| F-24 | While both layers are shown, the system shall display a node that has Falcon and SMAC devices so that its fuse-layer state and its transformer- layer state can both be identified. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The same pole can have a healthy transformer and an open fuse; a single color would hide one of them. | Validated High |   | Acceptance test |
| F-25 | When a new record is stored for a device, the system shall recompute the state of the node that the device belongs to. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The map has to follow the network as data arrives. | Validated High |   | Acceptance test |
| F-26 | When a device's inactivity period elapses without a new record, the system shall recompute the state of its node without waiting for new data. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A device that goes silent sends nothing, so the change has to come from the clock. | Validated High |   | Acceptance test |
| F-27 | The system shall limit the node detail shown on the map to the node's circuit and substation, its fuse sets and, for each fuse in each set, its identifier, phase, current state, Falcon supercapacitor level, solar-panel measurement and time of last record, and, if the node has a transformer, its identifier, current state, SMAC battery level, per-phase voltages and time of last record. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0, corrected in the client review | Gives enough context to act without leaving the map. | Validated High |   | Acceptance test against the database |
| F-28 | The system shall show a node's telemetry history only in the node view, never inside the map. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | History belongs in its own view, so the map stays fast and readable. | Validated High |   | Acceptance test |
| F-29 | The system shall show, in the node detail, the number of clients associated with each fuse set on the node. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Tells the operator how many clients are behind each branch. | Validated High |   | Acceptance test against the database |
| F-30 | When a node's state changes, the system shall update its marker on the open map without the user reloading the page. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Operators keep the map open; a manual reload would hide new faults. | Validated High |   | Acceptance test |
| F-31 | If an automatic refresh attempt fails, then the system shall show a visible warning that the map is no longer updating. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A frozen map must not be read as a stable network. | Validated High |   | Acceptance test |
| F-32 | The system shall show on the map view the time of the last successful refresh. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets the user judge how current the map is. | Validated High |   | Acceptance test |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-33 | When the user filters the map by zone, substation or circuit, the system shall show only the nodes that belong to the selected element. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Users work one area at a time. Validated High |   |   | Acceptance test |
| F-34 | When the user searches for a node or device identifier, the system shall center the map on the matching node. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Field teams report problems by pole or device code. | Validated High |   | Acceptance test |
| F-35 | When the user selects an alarm in the alarm listing, the system shall center the map on the corresponding node and highlight it. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Connects the fault list with its location. |   | Validated Medium Acceptance test |   |

## 1.3 Device inactivity

*F-36 to F-46*

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-36 | If a Falcon has produced no record for more than 9 hours, then the system shall treat it as inactive. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits' threshold for declaring a silent Falcon inactive. | Validated High |   | Boundary test |
| F-37 | If a SMAC has produced no record for more than 3 hours, then the system shall treat it as inactive. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits' threshold for declaring a silent SMAC inactive. | Validated High |   | Boundary test |
| F-38 | When a device becomes inactive, the system shall create an inactivity alarm for that device. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Inactivity has to appear with the other alarms, even though no device reports it. | Validated High |   | Acceptance test |
| F-39 | When an inactive device stores a new record, the system shall resolve its inactivity alarm automatically. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The alarm ends when the device reports again; nobody has to close it by hand. | Validated High |   | Acceptance test |
| F-40 | The system shall list the inactive devices within the user's scope, ordered from the oldest last record to the most recent. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The devices silent the longest need attention first. | Validated High |   | Acceptance test |
| F-41 | When the user filters the map by zone, substation or circuit, the system shall show in the inactive- device list only the devices that belong to the selected element. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0, corrected in the client review | Maintenance crews work by area. | Validated High |   | Acceptance test |
| F-42 | The system shall record each inactivity period of each device, with its start and end time. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Stored periods make the totals in history and in reports reproducible. | Validated High |   | Acceptance test on generated data |
| F-43 | When the user selects a time range, the system shall show the total inactivity time of each device within that range. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Supports diagnosing network or device problems, as Colbits states. | Validated High |   | Acceptance test on generated data |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-44 | If a Falcon's supercapacitor level falls below the low-energy threshold, then the system shall raise a low-energy alert for that device. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Low energy can explain, and anticipate, a device going silent. | Validated High |   | Acceptance test |
| F-45 | If a SMAC's battery level falls below the low- energy threshold, then the system shall raise a low-energy alert for that device. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Low energy can explain, and anticipate, a device going silent. | Validated High |   | Acceptance test |
| F-46 | The system shall take the time of every event from the timestamp stored in its record, not from when the system received or processed it. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Data can reach the database late; calculations must reflect when things happened. | Validated High |   | Acceptance test |

## 1.4 Alarms and fault classification

F-47 to F-58

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-47 | The system shall display next to the map a list of active faults that contains the alert types defined in section 3.2 of the Colbits specification and no others. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits allows no alert without direct backing in a column or event code of the database. | Validated High |   | Inspection |
| F-48 | When fuses of the same fuse set open less than the grouping window apart (initially 5 minutes), the system shall group those openings into a single fault. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The window stops one fault from being split in two when its phases open seconds apart. | Validated High |   | Automated test |
| F-49 | When a fault is formed, the system shall classify it as single-, two- or three-phase by counting its distinct canonical phases, not its device identifiers. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Counting identifiers would overstate a fault when one phase carries more than one device. | Validated High |   | Automated test |
| F-50 | If openings occur in different fuse sets of the same node, then the system shall report them as separate faults, without adding their phases together. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Grouping by node would wrongly turn faults on different branches into one three-phase fault. | Validated High |   | Automated test |
| F-51 | The system shall show, for each fault, its node, circuit, branch, affected phases, classification, instant of the first opening, elapsed duration and open or closed state. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Gives the operator what they need to locate a fault and judge its extent. | Validated High |   | Inspection |
| F-52 | The system shall include momentary fuse openings in the fault count. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Every opening counts unless the user chooses to filter short ones out. |   | Validated Medium Automated test |   |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-53 | Where the minimum-duration filter is enabled, the system shall exclude faults shorter than the configured minimum duration. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets users focus on sustained faults when they choose to. |   | Validated Medium Automated test |   |
| F-54 | While the minimum-duration filter is enabled, the system shall state it in the fault view and in every generated report. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The filter changes both the number of faults and the average duration, so readers must know it was on. |   | Validated Medium Inspection |   |
| F-55 | The system shall show, for each active fault, the number of affected clients, based on the clients associated with its fuse set. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The number of clients without service measures the real impact of a fault. | Validated High |   | Acceptance test against the database |
| F-56 | When the user filters the map by zone, substation or circuit, the system shall show in the alarm panel only the alarms of the selected element, without a separate filter in the panel. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0, corrected in the client review | Colbits asked for a single filter on the live view, the one at the top of the map, so the map and the alarm panel always show the same area. | Validated High |   | Acceptance test |
| F-57 | The system shall order the fault listing by severity, determined by the number of affected clients, and, for equal severity, by the age of the fault. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The faults that leave the most clients without service come first. | Validated High |   | Acceptance test |
| F-58 | The system shall show in the alarm panel summary separate counters of the nodes with an active fuse alarm (Falcon), voltage alarm (Falcon), phase out of range (SMAC) and phase drop (SMAC). | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0, corrected in the client review | Gives an immediate picture of the current situation. | Validated High |   | Acceptance test |

## 1.5 Alarm state

F-59 to F-63

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-59 | While a device keeps reporting the condition that originated an alarm, the system shall keep that alarm active. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | In this phase the device, not a person, decides the alarm state. | Validated High |   | Acceptance test |
| F-60 | When the device reports that the condition has returned to normal, the system shall mark the alarm as resolved. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | There is no manual acknowledgement or closure in this phase. | Validated High |   | Acceptance test |
| F-61 | When every phase involved in a fuse fault has registered a close, the system shall mark the fault as resolved. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A fault stays open while any of its phases is still open. | Validated High |   | Acceptance test |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-62 | While the user has selected the last hour or the last day in the alarm panel, the system shall list only the alarms resolved within that period, in descending chronological order. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0, corrected in the client review | The live panel shows recent events; older alarms are consulted in the historical- analysis view, as Colbits asked. | Validated High |   | Acceptance test |
| F-63 | The system shall measure an alarm's duration from its activation to the resolution reported by the device or, while it is still active, to the moment of the query. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Durations must be consistent across the listing, the history and the reports. | Validated High |   | Automated test |

## 1.6 Historical analysis and indicators

F-64 to F-75

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-64 | When the user accesses the aggregate historical- analysis view, the system shall provide quick date presets for last week, last month, last six months and last year, as well as a custom date range selector. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Allows users to analyze different periods. | Validated High |   | Acceptance test with each preset and one custom range |
| F-65 | When the user applies filters for zone, substation, circuit or node, the system shall display aggregate historical statistics restricted to the selected element within the user's assigned scope. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Allows users to focus the analysis on specific administrative sectors. | Validated High |   | Acceptance test with multi-scope accounts |
| F-66 | While rendering the aggregate historical view, the system shall display the evolution over time of fuse faults and voltage alarms in the selected range. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Helps users identify trends, recurring failure spikes and seasonal degradation across the grid. | Validated High |   | Acceptance test against the database |
| F-67 | The system shall display the distribution of faults by single-, two- and three-phase classification, applying the same grouping rule used in live monitoring (F-48 to F-50). | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Gives a clear picture of the operational severity of outages. | Validated High |   | Automated test |
| F-68 | While displaying the aggregate historical view, the system shall present the total fault counts by substation and by circuit within the selected scope. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Helps identify the substations and circuits with the most outages so maintenance can be prioritized. | Validated High |   | Acceptance test against the database |
| F-69 | When aggregate indicators are calculated, the system shall compute the average and maximum fault duration for the selected period and indicate next to them whether the minimum-duration filter was active. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The filter changes the result, so users must see whether it was applied. | Validated High |   | Automated test against calculated values |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-70 | While rendering the aggregate historical view, the system shall present a ranking of the nodes with the most faults and a ranking of the longest faults in the period. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Helps users spot the nodes with frequent faults and the outages that last longest. | Validated High |   | Acceptance test against the database |
| F-71 | The system shall display transformer load and imbalance indicators in the aggregate historical view, based on the load percentage and the voltage- and current-imbalance factors recorded by the SMAC. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Helps catch transformer overloads and phase imbalances before equipment is damaged. | Validated High |   | Acceptance test against SMAC records |
| F-72 | When the user selects a node on the map, the system shall open a dedicated node view with time-series charts of the Falcon variables (fuse state, voltage presence, internal temperature, supercapacitor level, solar panel, inclination) and the SMAC variables (per-phase voltages and currents, powers, power factor, load, imbalance), showing fuse state and voltage presence in separate charts, each broken down by fuse set. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0, corrected in the client review | Lets users investigate the history of a node and its devices to find the cause of a problem. | Validated High |   | Acceptance test and visual inspection |
| F-73 | While joining SMAC time-series data from its separate tables, the system shall align the voltage, current, power and power-factor records whose timestamps fall within the configured time tolerance. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Transformer readings arrive split across tables at slightly different times and must be analyzed together. | Validated High |   | Integration test with misaligned SMAC records |
| F-74 | While rendering the node view, the system shall display the node's historical faults and alarms and its total accumulated inactivity time in the requested period. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets users review a node's past faults and communication outages in one place. | Validated High |   | Acceptance test against alarm records |
| F-75 | When a historical query is executed for a fuse or transformer, the system shall retrieve the time series through the element's stable identifier (custom_id), regardless of changes to its physical device (hw_id). | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Keeps the history continuous when a physical device is replaced. | Validated High |   | Integration test |

## 1.7 Export and reports

F-76 to F-80

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-76 | When the user requests an XLSX or CSV export from the historical-analysis view, the system shall generate and download a file containing the records that match the active date range and filters. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets users take filtered historical records into spreadsheets. | Validated High |   | Inspection of exported files |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-77 | When the user requests a PDF report, the system shall generate a PDF with the charts and indicators of the view for the selected scope and date range. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Gives a summary document that can be shared with managers and external stakeholders. | Validated High |   | Inspection and acceptance test |
| F-78 | While generating any XLSX, CSV or PDF export, the system shall include a header declaring the requesting user, the generation time, the date range, the applied filters, the fault grouping window and the data coverage percentage. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Every file shows who generated it, when, and with which criteria. | Validated High |   | Inspection of file contents |
| F-79 | When report indicators are calculated, the system shall calculate them on the server, so that the same query parameters always produce the same results. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Results stay consistent no matter when or by whom a report is generated. | Validated High |   | Automated test and data comparison |
| F-80 | While preparing an export, the system shall include only data from devices, nodes and circuits within the requesting user's assigned scope. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Exports follow the same scope rules as the screens. | Validated High |   | Security test with multi-scope accounts |

## 1.8 Conversational assistant

F-81 to F-89

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-81 | When a user submits a question in Spanish through the platform chat, the system shall answer in Spanish with the relevant current or historical state of the network. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets users check the network status without opening several views. | Validated Low |   | Acceptance test and language inspection |
| F-82 | When the user asks about nodes with open fuses now or over a period, inactive devices, the devices in a zone, substation or circuit, or the state of a zone, substation, circuit or node, the system shall run the corresponding predefined query and return the result. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Covers the essential operational questions with predefined queries. | Validated Low |   | Demonstration and acceptance test |
| F-83 | When the user asks about clients without service and the highest-impact active fault, transformers in overload or with imbalance beyond threshold, node fault rankings, longest faults, the distribution of faults by classification, devices with degraded battery or solar panel, active free-fall alarms, or a period compared with the previous equivalent one, the system shall run the corresponding predefined query and return the result. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Gives quick access to the key operational indicators. | Validated Low |   | Acceptance test against database analytics |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-84 | When the user names a zone, substation, circuit or node in a question, the system shall restrict the assistant's answer to data within that element. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets users narrow answers to one area. | Validated Low |   | Acceptance test with filtered questions |
| F-85 | While answering about open fuses, the system shall group and classify the openings into faults with the same rule and the same figures as the monitoring view (F-48 to F-50). | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Keeps the assistant consistent with the map and the fault listing. | Validated Low |   | Cross-view comparison test |
| F-86 | While processing a question, the system shall exclude any device or event outside the user's assigned scope without revealing its existence. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | The chat must not become a way around the user's scope. | Validated Low |   | Security test with scope-restricted accounts |
| F-87 | The system shall restrict the assistant to read-only queries. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A question must never change the network data. | Validated Low |   | Security test |
| F-88 | If the requested data is not in the database for the queried period, then the system shall state that the datum is missing instead of estimating a value. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Keeps answers truthful when records are missing. | Validated Low |   | Acceptance test with out-of-range queries |
| F-89 | When the assistant gives an answer with network figures, the system shall show the queried elements and range and a link to the corresponding node on the map. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets users verify an answer and jump from it to the location on the map. | Validated Low |   | Demonstration and map navigation test |

## 1.9 Synthetic data generator

F-90 to F-98

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-90 | The generator shall produce data with the same structure as the real database schema, so that the application cannot tell the origin apart. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets the team develop and demonstrate without depending on the database copy. | Validated High |   | Integration test |
| F-91 | The generator shall allow the number of zones, substations, circuits, nodes, fuse sets and devices to be set as parameters, including nodes with more than one branch. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Datasets can be built at any size; legacy repetition fuse sets are not required. | Validated High |   | Acceptance test |
| F-92 | The generator shall allow the telemetry periodicity and the time range to populate to be set as parameters. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Datasets can match the reporting rhythm and history length each test needs. | Validated High |   | Acceptance test |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-93 | The generator shall induce, in a controlled way, single-, two- and three-phase openings, loss of voltage, transformer phase drop, overload, low device energy, device inactivity, free fall and solar- panel alarm. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Every alert type the system handles can be reproduced on demand. | Validated High |   | Acceptance test |
| F-94 | The generator shall induce phase openings separated by configurable intervals around the grouping window, both inside and outside it. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Exercises the grouping rule in both senses: openings that must group and openings that must not. | Validated High |   | Acceptance test |
| F-95 | The generator shall produce gaps in the data that trigger inactivity detection and the gray node state. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Inactivity can only be tested if data goes missing on purpose. | Validated High |   | Acceptance test |
| F-96 | When the generator runs with the same seed and configuration, it shall produce the same dataset. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Makes the automated tests reproducible. | Validated High |   | Automated test |
| F-97 | The generator shall run from the command line or as a service, without requiring the platform interface. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | Tests and continuous integration can create data without a browser. | Validated High |   | Demonstration |
| F-98 | The generator shall keep generated coordinates geographically coherent within each circuit. | Functional | Colbits Scope, Requirements and Use Cases Specification v6.0 | A circuit must not appear scattered across the country on the map. | Validated High |   | Inspection |

## 1.10 Interface language

F-99

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-99 | The system shall let the user switch the interface language between Spanish (es-CO), the default, and English, and shall remember the choice on that browser. | Functional | Team | Colbits works in Spanish, but the course supervisors and part of the team review the platform in English. | Validated Low |   | Acceptance test |


## 2. Non-functional requirements

Grouped by ISO/IEC 25010:2023 quality characteristic. Performance, security and flexibility requirements apply to the whole system; the maintainability group covers the automated tests requested by Colbits.

| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
|   | Performance efficiency · NF-01 to NF-02 |   |   |   |   |   |   |
| NF-01 | The system shall show a node state change on the map no more than 20 seconds after the record that causes it is available in the database. | Non-functional: Performance efficiency | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits' latency target for live monitoring. | Validated High |   | Timed test |
| NF-02 | While up to 50 users are active at the same time, the system shall return 95% of historical query responses within 2.0 seconds. | Non-functional: Performance efficiency | Team | Keeps the dashboards fast when several engineers run historical queries at the same time. | Validated High |   | Load test (for example k6 or JMeter) |
|   | Security · NF-03 to NF-06 |   |   |   |   |   |   |
| NF-03 | The system shall access the existing telemetry and alarm tables in read-only mode and reject any write to them. | Non-functional: Security | Colbits Scope, Requirements and Use Cases Specification v6.0 | Protects the real telemetry from accidental or malicious changes. | Validated High |   | Automated security test |
| NF-04 | The system shall store user passwords only as salted hashes produced by an adaptive algorithm such as bcrypt or Argon2. | Non-functional: Security | Team | Prevents credential exposure if the database is breached. | Validated High |   | Code and database inspection |
| NF-05 | If a user submits invalid credentials 5 consecutive times, then the system shall lock the account for 15 minutes. | Non-functional: Security | Team | Prevents brute-force authentication attacks. | Validated High |   | Automated security test |
| NF-06 | If a user session has been inactive for 15 minutes, then the system shall invalidate its authentication token. | Non-functional: Security | Team | Prevents others from using an unattended session. | Validated High |   | Acceptance test |
|   | Flexibility · NF-07 to NF-12 |   |   |   |   |   |   |
| NF-07 | The system shall let the Falcon and SMAC inactivity thresholds be changed without modifying code. | Non-functional: Flexibility | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires both values to be configurable, not hard- coded. | Validated High |   | Configuration test |
| NF-08 | The system shall let the low-energy thresholds be changed without modifying code. | Non-functional: Flexibility | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires a configurable threshold. | Validated High |   | Configuration test |
| NF-09 | The system shall let the fault grouping window be changed without modifying code. | Non-functional: Flexibility | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires the window to be configurable, starting at 5 minutes. | Validated High |   | Configuration test |
| NF-10 | The system shall let the minimum duration used by the minimum-duration filter be changed without modifying code. | Non-functional: Flexibility | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires a configurable minimum-duration filter. |   | Validated Medium Configuration test |   |


| ID | Requirement statement | Type | Source | Rationale | Status |   | Priority Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NF-11 | The system shall let the severity criterion of the fault listing be changed without modifying code. | Non-functional: Flexibility | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires the severity criterion to be configurable. | Validated High |   | Configuration test |
| NF-12 | The system shall let the time tolerance used to align SMAC records be changed without modifying code. | Non-functional: Flexibility | Colbits Scope, Requirements and Use Cases Specification v6.0 | Colbits requires a configurable alignment tolerance. | Validated High |   | Configuration test |
|   | Maintainability (testability) · NF-13 to NF-21 |   |   |   |   |   |   |
| NF-13 | The repository shall include an automated API test suite covering the authentication, data scope, node state, faults and history services. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Requested by the academic supervision to keep the core services verifiable. | Validated High |   | Inspection of the test suite |
| NF-14 | The API test suite shall include an explicit test that a user obtains no data for devices outside their scope from any service, aggregates included. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Checks the most critical rule of a platform shared by several clients. | Validated High |   | Inspection of the test suite |
| NF-15 | The API test suite shall include tests of the fault grouping and classification rule covering at least phases inside and outside the window, simultaneous faults on different branches of the same node, and faults that remain open. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Protects the rule that decides how serious each fault looks. | Validated High |   | Inspection of the test suite |
| NF-16 | The automated tests shall run against data produced by the synthetic generator, without depending on real data. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Keeps the tests reproducible and independent of the database copy. | Validated High |   | Demonstration |
| NF-17 | The repository shall include an automated interface test suite covering login, map visualization with both layers, consulting a fault, consulting the history and export. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Checks the main user flows end to end. |   | Validated Medium Inspection of the | test suite |
| NF-18 | Both test suites shall run in continuous integration on every change proposed to the main branch. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Errors are caught before they reach the main branch. |   | Validated Medium CI pipeline | inspection |
| NF-19 | The project shall publish a test coverage report as part of its deliverables. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Shows how much of the code the tests exercise. |   | Validated Medium Inspection of the | deliverables |
| NF-20 | The automated API test suite shall achieve at least 80% code coverage across the authentication, data scope, node state, faults and history services. | Non-functional: Maintainability | Team | Gives the coverage report a pass mark. |   | Validated Medium CI pipeline | inspection |
| NF-21 | The repository shall document how to run both test suites in a clean environment. | Non-functional: Maintainability | Colbits Scope, Requirements and Use Cases Specification v6.0 | Lets the Colbits team run and evaluate the tests without undocumented setup. | Validated High |   | Demonstration on a clean machine |


## 3. Acceptance criteria

Every requirement has at least one pass-or-fail check. Functional criteria use Given/When/Then; non-functional criteria state the method and the pass condition.

## 3.1 Functional requirements

## Authentication, roles and data scope (F-01 to F-11)

| ID | Acceptance criteria |
| --- | --- |
| F-01 | Given an active account, when the user logs in with the correct username and password, then the system authenticates the user and issues an access token. |
| F-02 | Given any API endpoint, when a request arrives without a token or with an expired or altered one, then the system rejects it and returns no data. |
| F-03 | Given the user administration module, when an administrator creates or edits a user, then the only roles offered are Colbits administrator and consultation user. |
| F-04 | Given a Colbits administrator, when they open the map and the fault listing, then every node and fault in the database appears, with no scope filter applied. |
| F-05 | Given a consultation user, when they try to create, modify or deactivate a user or change a scope assignment, then the system rejects the request with a permission error; the same actions succeed for a Colbits administrator. |
| F-06 | Given a consultation user, when they attempt any write operation through the interface or the API, then the system rejects it with a permission error. |
| F-07 | Given a Colbits administrator, when they create two consultation users with different circuits assigned, then each user can log in and sees only their own circuits. |
| F-08 | Given five consultation users, when an administrator assigns one a zone, one a substation, one a circuit, one a node and one a single device, then each user sees exactly the elements under their assignment. |
| F-09 | Given two consultation users, when an administrator assigns Circuit A to both, then both users can see Circuit A's data. |
| F-10 | Given an authenticated consultation user assigned only to Circuit A, when they call any service, counts and aggregates included, then only data from Circuit A is returned. |
| F-11 | Given an active session, when the user logs out and presses the browser's back button, then no data is shown and they remain on the login page. |

## Map and node state (F-12 to F-35)

| ID | Acceptance criteria |
| --- | --- |
| F-12 | Given a user whose scope contains nodes N1 and N2 but not N3, when the user opens the map, then N1 and N2 appear at their recorded coordinates and N3 does not appear. |
| F-13 | Given two nodes whose markers overlap at the current zoom, when the map is shown, then they appear as one cluster; when the user zooms in until they no longer overlap, then they appear as two separate markers. |
| F-14 | Given both layers shown, when the user hides the transformer layer, then only fuse-layer markers remain; when the user shows it again and hides the fuse layer, then only transformer-layer markers remain. |
| F-15 | Given a node with one fuse open and another fuse without voltage, when the fuse layer is shown, then the node is red. The node is also red if one fuse is open and another Falcon on it is inactive. |
| F-16 | Given a node with no fuse open and one fuse without voltage, when the fuse layer is shown, then the node is yellow. |
| F-17 | Given a node with no fuse open, none without voltage, and one Falcon whose last record is more than 9 hours old, when the fuse layer is shown, then the node is gray. |


| ID | Acceptance criteria |
| --- | --- |
| F-18 | Given a node where every Falcon reported within the last 9 hours, closed and with voltage, when the fuse layer is shown, then the node is green. |
| F-19 | Given a three-phase transformer with two phases down, when the transformer layer is shown, then the node is red. |
| F-20 | Given a transformer with exactly one phase down, when the transformer layer is shown, then the node is yellow. |
| F-21 | Given a transformer with no phase down whose SMAC has no record for more than 3 hours, when the transformer layer is shown, then the node is gray. |
| F-22 | Given a transformer with no phase down and a SMAC record within the last 3 hours, when the transformer layer is shown, then the node is green. |
| F-23 | Given a two-phase transformer with both phases down, when the transformer layer is shown, then the node is red (CU-01, flow 3b). Given a two-phase transformer with one phase down, then the node is yellow, not red. |
| F-24 | Given both layers shown and a node that is red on the fuse layer and green on the transformer layer, when the map is displayed, then a user can identify both states without hiding a layer (CU-01, flow 3c). |
| F-25 | Given a green node, when a record showing an open fuse is stored for one of its Falcons, then the node's fuse-layer state is recomputed and turns red. |
| F-26 | Given a green node whose Falcon last reported 8 h 59 min ago, when 2 minutes pass with no new record, then the node turns gray (CU-01, flow 3a). |
| F-27 | Given a node with fuse set A (phases R, S and T), fuse set B (phases R and S) and one SMAC, when its detail is shown on the map, then it shows fuse set A with three fuses, fuse set B with two, and the transformer, each with every listed field matching the database, and no other telemetry appears. |
| F-28 | Given a node with recorded telemetry, when the user looks at it on the map, then no charts or telemetry series appear there; its history is available in the node view. |
| F-29 | Given a node with fuse set A (120 clients) and fuse set B (45 clients), when its detail is shown, then it shows 120 for A and 45 for B. |
| F-30 | Given the map is open, when a state-changing record is inserted, then the marker changes color without a page reload. |
| F-31 | Given the map is open, when the API becomes unreachable, then a warning appears at the next failed refresh (CU-01, flow 6a). |
| F-32 | Given the map is open, when a refresh succeeds, then the displayed time updates; after the API is cut, the time stays at the last successful refresh. |
| F-33 | Given nodes in circuits C1 and C2, when the user filters by C1, then only C1's nodes remain. The filter offers only elements within the user's scope. |
| F-34 | Given a node identifier and the identifier of a device installed on another node, when the user searches each one, then the map centers on the corresponding node. An unknown identifier, or one outside the user's scope, shows no results. |
| F-35 | Given the alarm listing next to the map, when the user selects an alarm, then the map centers on that alarm's node and highlights it. |

## Device inactivity (F-36 to F-46)

| ID | Acceptance criteria |
| --- | --- |
| F-36 | Given a Falcon whose last record is 8 h 59 min old, then it is active; at 9 h 01 min, it is inactive. |
| F-37 | Given a SMAC whose last record is 2 h 59 min old, then it is active; at 3 h 01 min, it is inactive. |
| F-38 | Given an active Falcon, when its last record passes 9 hours, then an inactivity alarm for it appears among the active alarms. |
| F-39 | Given an open inactivity alarm, when the device stores a new record, then the alarm is resolved, with its end time taken from that record's timestamp. |


| ID | Acceptance criteria |
| --- | --- |
| F-40 | Given inactive devices whose last records are 30, 12 and 4 hours old, when the user opens the list, then they appear in that order, and devices outside the user's scope do not appear. |
| F-41 | Given inactive devices in circuits C1 and C2, when the user filters the map by C1, then the inactive-device list shows only the devices of C1, and the list offers no filter of its own. |
| F-42 | Given a Falcon with records at 00:00 and 20:00 and none in between, when inactivity is computed, then one period is stored that starts at 09:00, the moment the device was declared inactive, and ends at 20:00, when it reported again. |
| F-43 | Given a device with inactivity periods of 5 h and 3 h inside a range, plus a 4 h period of which 2 h fall inside it, when the user selects that range, then the total shown is 10 h. |
| F-44 | Given the configured low-energy threshold for the Falcon supercapacitor, when a reading below that threshold is stored, then a low-energy alert appears for that device; when a reading above it is stored, then no alert is raised. |
| F-45 | Given the configured low-energy threshold for the SMAC battery, when a reading below that threshold is stored, then a low-energy alert appears for that device; when a reading above it is stored, then no alert is raised. |
| F-46 | Given a Falcon record with a timestamp 10 hours old that is inserted now, when inactivity is computed, then the gap is measured from the stored timestamps and the device counts as inactive. |

## Alarms and fault classification (F-47 to F-58)

| ID | Acceptance criteria |
| --- | --- |
| F-47 | Given data that produces every alert type in section 3.2 (fuse opening, loss of voltage, free fall or abnormal movement, solar-panel failure, phase drop or recovery, phase out of range, overload and imbalance, low device energy, device inactivity), when the list is shown next to the map, then each of those types can appear and no other type, such as tampering, ever appears. |
| F-48 | Given phases R and S of the same fuse set opening 2 minutes apart, when faults are computed, then one fault is reported; if they open 30 minutes apart, then two faults are reported (CU-02, flow 1b). |
| F-49 | Given openings on phases R and S of one fuse set within the window, when the fault is classified, then it is two-phase; given openings on R, S and T, then it is three-phase. Identifiers that differ only in the repetition digit count as one phase. |
| F-50 | Given a node with fuse set A with phase R open and fuse set B with phases R and S open, when faults are computed, then one single-phase fault and one two-phase fault are reported, never a three-phase one (CU-02, flow 1a). |
| F-51 | Given an active two-phase fault on branch B of a node, when it appears in the list, then it shows the node, circuit, branch B, the two affected phases, two-phase, the time of the first opening, the elapsed duration and the state open. |
| F-52 | Given a fuse that opens and closes again within 20 seconds, when faults are counted with the minimum-duration filter off, then that opening counts as one fault. |
| F-53 | Given faults lasting 20 seconds and 10 minutes and a minimum duration of 1 minute, when the filter is enabled, then only the 10-minute fault is counted; when it is disabled, both are counted. |
| F-54 | Given the minimum-duration filter enabled, when the user opens the fault view and generates an XLSX, a CSV and a PDF report, then each of them states that the filter is active. |
| F-55 | Given an active fault on a fuse set with 80 associated clients, when the fault list is shown, then that fault shows 80 affected clients. |
| F-56 | Given active faults in circuits C1 and C2, when the user filters the map by C1, then the alarm panel shows only the faults of C1, and the panel has no filter of its own apart from its tabs and the last hour / last day selector. |


| ID | Acceptance criteria |
| --- | --- |
| F-57 | Given three active faults affecting 200, 50 and 50 clients, when the listing loads, then the 200-client fault is first and the two 50-client faults follow, oldest first. |
| F-58 | Given node N1 with open fuses on two different fuse sets and node N2 whose SMAC reports a dropped phase, when the alarm panel summary is shown, then it counts 1 node with a fuse alarm, 1 node with a phase drop and 0 nodes with a phase out of range, and no counter by fault classification or alert type appears. |

## Alarm state (F-59 to F-63)

| ID | Acceptance criteria |
| --- | --- |
| F-59 | Given an active loss-of-voltage alarm, when the device keeps reporting no voltage, then the alarm stays active. |
| F-60 | Given an active loss-of-voltage alarm, when the device reports voltage again, then the alarm becomes resolved, with that moment as its resolution time. |
| F-61 | Given a two-phase fault, when only one phase closes, then the fault stays open and its duration keeps counting (CU-02, flow 3a); when the second phase closes, then it becomes resolved. |
| F-62 | Given alarms resolved 30 minutes, 5 hours and 2 days ago, and a fault that has been active for 2 days, when the user selects the last hour, then only the alarm resolved 30 minutes ago appears in the resolved list; when the user selects the last day, then the alarms resolved 30 minutes and 5 hours ago appear, newest first. In both cases the fault active for 2 days stays in the active list. |
| F-63 | Given an alarm activated at 10:00 and resolved at 10:45, when its duration is shown, then it reads 45 minutes; given an alarm activated at 10:00 and still active at 11:30, then it reads 90 minutes at that moment. |

## Historical analysis and indicators (F-64 to F-75)

| ID | Acceptance criteria |
| --- | --- |
| F-64 | Given a logged-in user in the historical-analysis view, when the user selects the Last month preset, then the queried range spans the preceding 30 or 31 calendar days. |
| F-65 | Given a user with assigned access to Circuit A and Circuit B, when the user selects Circuit A in the scope filter, then all aggregate charts and metrics reflect only telemetry and events from Circuit A. |
| F-66 | Given a selected range containing fuse openings and loss-of-voltage events, when the aggregate historical view is rendered, then trend charts show how fuse faults and voltage alarms are distributed over time intervals. |
| F-67 | Given historical data with openings on phases R, S and T of the same fuse set within 3 minutes, when the fault distribution for that period is calculated, then they count as exactly one three-phase fault in the classification breakdown. |
| F-68 | Given a historical dataset spanning several substations and circuits, when the user views the aggregate distribution panel, then a breakdown shows the exact number of faults recorded for each substation and circuit. |
| F-69 | Given the minimum-duration filter enabled with a threshold of 1 minute, when the user generates the historical summary, then the average and maximum durations are computed only from faults longer than 1 minute and a visible label states that the filter is active. |
| F-70 | Given historical records for the selected month, when the user views the ranking panel, then it shows the nodes ordered by total fault count and the individual faults ordered by duration, longest first. |
| F-71 | Given SMAC records with known load percentages and voltage- and current-imbalance factors, when the historical view shows transformer indicators for that period, then the displayed values match the recorded ones. |


| ID | Acceptance criteria |
| --- | --- |
| F-72 | Given a node with fuse sets A and B and one SMAC, when the user opens its node view, then it shows time-series charts for every listed Falcon and SMAC variable over the active time window, with fuse state and voltage presence in two separate charts, each broken down into fuse set A and fuse set B. |
| F-73 | Given SMAC telemetry split across three tables with timestamps 12 seconds apart and a tolerance of 30 seconds, when the node view is requested, then the records are joined into one data point without dropping rows. |
| F-74 | Given a pole with two fuse openings and 18 hours of Falcon inactivity in the past week, when the node view is opened for that week, then it lists both openings with their start and end times and shows a total inactivity of 18 hours. |
| F-75 | Given a transformer whose SMAC was replaced on 15 June while keeping its custom_id, when a user queries its voltage history from 1 to 30 June, then the chart is continuous across the whole month. |

## Export and reports (F-76 to F-80)

| ID | Acceptance criteria |
| --- | --- |
| F-76 | Given a user viewing historical data filtered for one circuit and date range, when the user exports to XLSX or CSV, then the downloaded file contains the rows that match the active filters on screen. |
| F-77 | Given a user viewing historical indicators for one substation over the past month, when the user downloads the PDF report, then it contains the corresponding charts and key indicators. |
| F-78 | Given a user named John Doe exporting data for Substation A, when the XLSX, CSV or PDF file is generated, then its header shows John Doe, the generation date and time, Substation A, the date range, the grouping window and the data coverage percentage. |
| F-79 | Given a fixed historical dataset, when two reports are generated with identical date ranges and filters, then both contain identical indicator values. |
| F-80 | Given a consultation user assigned only to Circuit 1, when the user exports data or generates a PDF report, then the file contains no records, metrics or telemetry from any other circuit. |

## Conversational assistant (F-81 to F-89)

| ID | Acceptance criteria |
| --- | --- |
| F-81 | Given an authenticated user in the chat, when the user asks in Spanish about the state of the network, then the assistant answers in Spanish with correct information about the requested elements. |
| F-82 | Given a user in the chat, when the user asks which devices are currently inactive in Circuit 1, then the assistant runs the predefined query and lists the inactive devices of Circuit 1 with their last record time. |
| F-83 | Given transformer load data, when the user asks which transformers are currently in overload, then the assistant lists those transformers with their current load percentage. |
| F-84 | Given a user asking about active fuse openings, when the user adds in Substation North, then the assistant returns only open fuses that belong to Substation North. |
| F-85 | Given an active two-phase fault, when the user asks the assistant for open fuses, then the answer shows it grouped by branch and classified as two-phase, with the same figures as the live monitoring view. |
| F-86 | Given a consultation user assigned only to Circuit A, when the user asks which faults are active across the network, then the assistant returns only faults in Circuit A and gives no hint of any others. |


| ID | Acceptance criteria |
| --- | --- |
| F-87 | Given the assistant, when a user asks it to delete, change or add data, then no data changes and the assistant says it cannot do that. |
| F-88 | Given a period with no recorded telemetry, when the user asks about it, then the assistant says that no data is available for that period and gives no estimated numbers. |
| F-89 | Given an answer about a node with an active fault, when the user reads it, then it states the queried scope and date range and offers a button that centers and highlights that node on the map. |

## Synthetic data generator (F-90 to F-98)

| ID | Acceptance criteria |
| --- | --- |
| F-90 | Given a database populated only by the generator, when the system runs against it, then every view works with no code or configuration change other than the connection. |
| F-91 | Given a configuration of 2 zones, 3 substations, 5 circuits and 50 nodes, 5 of them with two branches, when the generator runs, then the database contains exactly those counts, including the 5 two-branch nodes. |
| F-92 | Given a periodicity of 15 minutes and a range of 7 days, when the generator runs, then each device has a record every 15 minutes across those 7 days, except where gaps were induced. |
| F-93 | Given a configuration that requests one scenario of each listed type, when the generator runs, then the system shows each of those alerts on the expected device. |
| F-94 | Given intervals of 2 and 8 minutes with a 5-minute window, when the generator runs, then the 2-minute pair is grouped into one fault and the 8-minute pair produces two faults. |
| F-95 | Given a 10-hour gap induced for one Falcon, when the system processes the data, then that device is inactive and its node shows gray. |
| F-96 | Given one seed and one configuration, when the generator runs twice, then both datasets are identical. |
| F-97 | Given a clean machine with the generator installed, when it is run from the command line, then it populates the database without the platform interface running. |
| F-98 | Given a generated circuit, when its nodes are shown on the map, then they form one compact area instead of scattered points. |

## Interface language (F-99)

| ID | Acceptance criteria |
| --- | --- |
| F-99 | Given a first visit, when the app opens, then it is in Spanish (es-CO); when the user selects EN, every visible text changes to English without reloading, and after reloading the page the app stays in English. |

## 3.2 Non-functional requirements

| ID | Acceptance criteria |
| --- | --- |
|   | Performance efficiency · NF-01 to NF-02 |
| NF-01 | Method: with the map open, insert 20 state-changing records at random moments and time each marker change from the database commit. Pass if all 20 changes appear within 20 seconds. |


| ID | Acceptance criteria |
| --- | --- |
| NF-02 | Method: load test with 50 concurrent users requesting 30-day aggregate and node-level history every 5 seconds for 15 minutes. Pass if the 95th-percentile response time is 2.0 seconds or less, with no HTTP 5xx errors. |
|   | Security · NF-03 to NF-06 |
| NF-03 | Method: with the system's database account, attempt to insert, update and delete rows in the telemetry and alarm tables. Pass if every attempt is rejected with a permission error. |
| NF-04 | Method: inspect the user table and the authentication code. Pass if no password is stored in plain text or reversible form and every hash is salted and produced by bcrypt or Argon2. |
| NF-05 | Method: fail the login 5 times in a row with a script, then try the correct password. Pass if the account stays locked for 15 minutes and accepts the correct password afterwards. |
| NF-06 | Method: leave an active session idle for 15 minutes, then make any request. Pass if the token is rejected and the user has to log in again. |
|   | Flexibility · NF-07 to NF-12 |
| NF-07 | Method: change the Falcon threshold from 9 to 6 hours through the configuration. Pass if a Falcon silent for 7 hours becomes inactive with no code change. |
| NF-08 | Method: raise the Falcon threshold through the configuration. Pass if a reading between the old and the new value now raises the alert, with no code change. |
| NF-09 | Method: change the grouping window from 5 to 10 minutes through the configuration. Pass if two openings 8 minutes apart on the same fuse set are then grouped into one fault, with no code change. |
| NF-10 | Method: change the minimum duration from 1 to 5 minutes through the configuration. Pass if a 3-minute fault is then excluded while the filter is on, with no code change. |
| NF-11 | Method: change the severity criterion through the configuration. Pass if the fault listing follows the new criterion, with no code change. |
| NF-12 | Method: change the tolerance from 30 to 5 seconds through the configuration. Pass if records 12 seconds apart are no longer joined into one point, with no code change. |
|   | Maintainability (testability) · NF-13 to NF-21 |
| NF-13 | Method: run the API suite in a clean environment and review its test list. Pass if it runs to completion and contains tests for authentication, data scope, node state, faults and history. |
| NF-14 | Method: remove the scope filter from one service in a test branch and run the suite. Pass if the scope test fails. |
| NF-15 | Method: review the grouping tests and run them. Pass if at least one test exists for each of the three listed cases and all of them pass. |
| NF-16 | Method: run both suites on a machine with no access to the database copy. Pass if they run using generated data only. |
| NF-17 | Method: run the interface suite. Pass if it covers the five listed flows and all of its tests pass. |
| NF-18 | Method: open a pull request to the main branch. Pass if both suites run automatically and their result is shown on the pull request. |
| NF-19 | Method: check the delivered repository. Pass if it contains an up-to-date coverage report for the test suites. |
| NF-20 | Method: run the API suite in the continuous integration pipeline. Pass if the generated coverage report shows at least 80%. |
| NF-21 | Method: a team member follows the repository instructions on a clean machine. Pass if both suites run to completion without steps beyond those documented. |
