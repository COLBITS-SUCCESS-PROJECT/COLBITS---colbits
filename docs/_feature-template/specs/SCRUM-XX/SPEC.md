---
feature: <nombre-del-feature>
story: SCRUM-XX
status: EN_CURSO
last_updated: YYYY-MM-DD
---

# SCRUM-XX — Título de la historia

## 1. Objetivo
¿Qué problema resuelve esta historia? ¿Qué puede hacer el usuario que antes no podía?

## 2. Criterios de aceptación
- [ ] CA1: ...
- [ ] CA2: ...

## 3. Pantallas y estados
| Estado | Descripción |
|---|---|
| Cargando | Skeleton o spinner mientras llegan los datos |
| Éxito | Vista principal con datos reales |
| Vacío | Mensaje cuando no hay datos que mostrar |
| Error | Mensaje de error con opción de reintentar |

## 4. Flujo de usuario
1. El usuario hace X
2. El sistema responde con Y
3. ...

## 5. Modelo de datos (provisional)
```ts
// DTO del backend — marcar PROVISIONAL hasta confirmar con OpenAPI
interface ExampleDTO {
  id: string
  // ...
}
```

## 6. Endpoints usados
| Método | Path | Descripción |
|---|---|---|
| GET | `/api/v1/...` | ... |

## 7. Preguntas abiertas
| ID | Pregunta | Responsable | Bloqueante |
|---|---|---|---|
| OQ-01 | ... | ... | Sí / No |

## 8. Notas de implementación
<!-- Decisiones técnicas, edge cases, cosas a tener en cuenta -->
