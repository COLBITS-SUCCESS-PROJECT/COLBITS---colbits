# COLBITS Domain Glossary

This file maps domain terms to their code names, i18n keys, and enum values.
Update this file whenever a new domain concept is introduced.

| Domain term | Code name | i18n namespace:key | API field | Notes |
|---|---|---|---|---|
| Red eléctrica / Electrical network | `Network` | `devices:network` | `network` | A collection of nodes and sensors |
| Nodo / Node | `Node` | `devices:node` | `node` | A device in the network |
| Sensor | `Sensor` | `devices:sensor` | `sensor` | Measurement point on a node |
| Medición / Reading | `SensorReading` | `dashboard:reading` | `reading` | A single data point from a sensor |
| Umbral / Threshold | `AlertThreshold` | `alerts:threshold` | `threshold` | Min/max value triggering an alert |
| Alerta / Alert | `Alert` | `alerts:alert` | `alert` | Active threshold violation |
| Estado / Status (device) | `DeviceStatus` enum | `devices:status.{CODE}` | `status` | See DeviceStatus enum below |
| Nivel de alerta / Alert level | `AlertLevel` enum | `alerts:level.{CODE}` | `level` | See AlertLevel enum below |

## Enums

### DeviceStatus
```ts
enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  WARNING = 'WARNING',
  MAINTENANCE = 'MAINTENANCE',
  UNKNOWN = 'UNKNOWN',
}
```

### AlertLevel
```ts
enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}
```

### SensorType
```ts
enum SensorType {
  VOLTAGE = 'VOLTAGE',
  CURRENT = 'CURRENT',
  POWER = 'POWER',
  FREQUENCY = 'FREQUENCY',
  POWER_FACTOR = 'POWER_FACTOR',
}
```

## Units

| Sensor type | Unit | Display |
|---|---|---|
| VOLTAGE | V | "220 V" |
| CURRENT | A | "15.3 A" |
| POWER | kW | "1.2 kW" |
| FREQUENCY | Hz | "60.0 Hz" |
| POWER_FACTOR | — | "0.95" (dimensionless) |
