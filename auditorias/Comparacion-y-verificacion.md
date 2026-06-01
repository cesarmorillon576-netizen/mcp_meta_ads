# Comparación de auditorías + verificación contra Graph API

**Cuenta:** CLARA Body Zen Oficial 2026 (`act_2222830017344`) · **Periodo:** 2026-05-02 → 2026-06-01
**Documentos comparados:**
- 🅰️ **Manual** (granular, multi-tool) → `Auditoria-CLARA-BodyZen_2026-05.md`
- 🅱️ **Auto-exhaustiva** (`auditoria_completa` profundidad=completo, UNA llamada) → `CLARA_auto-exhaustiva.md`

---

## 1. Verificación de veracidad — Graph API v24.0 en crudo

Llamé directo a `graph.facebook.com/v24.0` (curl, **sin pasar por el SDK**) y comparé contra lo que reportó la herramienta:

| Métrica | Auditoría (tool/SDK) | Graph API crudo | ¿Cuadra? |
|---|---|---|---|
| Cuenta — gasto | $3,186.81 | $3,187.02 | ✅ (Δ $0.21, dato en vivo) |
| Cuenta — conversaciones | 32 | 32 | ✅ exacto |
| Cuenta — clics al enlace | 535 | 535 | ✅ exacto |
| Cuenta — vieron bienvenida | 60 | 60 | ✅ exacto |
| P1 — gasto | $1,762.77 | $1,762.77 | ✅ exacto |
| P1 — CPM | $54.02 | $54.02 | ✅ exacto |
| P1 — clics al enlace | 185 | 185 | ✅ exacto |
| P1 — conversaciones | 22 | 22 | ✅ exacto |
| P1 — profundidad 2 / 3 | 9 / 4 | 9 / 4 | ✅ exacto |
| HIFU — gasto | $848.99 | $848.99 | ✅ exacto |
| HIFU — CPM | $150.95 | $150.90 | ✅ (Δ $0.05, redondeo) |
| HIFU — clics | 39 | 39 | ✅ exacto |

**Veredicto de veracidad: ✅ los datos son fieles a la Graph API.** Las diferencias de centavos son **dato en vivo** (Meta actualiza los insights en casi tiempo real; la auditoría y el curl se corrieron con minutos de diferencia). Ninguna discrepancia estructural.

---

## 2. En qué coinciden las dos auditorías

- Gasto total ≈ **$3,185** · **32 conversaciones** · CPA nominal **$99.5** · CPA real **≈ $796**.
- Embudo de P1: **185 clics → 60 vieron bienvenida → 22 escribieron → … → 4 a 3 mensajes**.
- Las **dos fugas** (clic→conversación y profundidad del chat) y el veredicto: el problema está en WhatsApp, no en los creativos.
- HIFU con CPM disparado por audiencia muy chica.
- La otra cuenta "CLARA Bodyzen" (`act_2209…`) está vacía.

---

## 3. Diferencias

### 3.1 Lo que la auto-exhaustiva AHORA sí trae (antes le faltaba)

La versión de `auditoria_completa` que falló en Claude web arrancaba el embudo en "Contactos" y no bajaba por campaña. La nueva:

- ✅ **Detecta sola la Fuga #1** en los hallazgos priorizados:
  `🔴 "CLARA Interacción P1": de 185 clics solo 22 escribieron (12%) — fuga al saltar a WhatsApp`
- ✅ **Detecta sola el CPM/geo de HIFU:**
  `🟠 "HIFU": CPM $151 (2.4x la mediana) — audiencia probablemente muy chica`
- ✅ **Sección 10**: reporte completo de **las 5 campañas** (conjuntos, segmentación configurada, entrega real por plataforma/edad/género, anuncios, **CTA**). O sea, **toda la materia prima del documento manual está presente**.

### 3.2 Un punto donde la auto-exhaustiva es MEJOR que mi documento manual 🎯

Mi documento manual mezcló ventanas de fecha sin darme cuenta:
- La tabla de campañas usó el rango explícito (HIFU **$845.80**).
- Pero el deep-dive de HIFU usó `last_30d` (preset), dando HIFU **$658.11 / CPM $142.36**.

→ **Mi doc manual tenía dos cifras distintas para HIFU.** La auto-exhaustiva usa **una sola ventana en todo** (HIFU $848.99 / CPM $150.95 en cada sección). **Es internamente consistente; mi versión a mano no lo era.**

### 3.3 Lo que el documento manual aporta y la auto-exhaustiva (todavía) deja al lector

La auto-exhaustiva entrega **datos + banderas**; la **síntesis narrativa** sigue siendo trabajo de quien lee (Claude):

| Aporte del doc manual | ¿Está en la auto-exhaustiva? |
|---|---|
| Cruce "género configurado (Mujeres) vs entregado ($462 a Hombres)" | Los **datos** sí (segmentación + entrega por género en sección 10); el **cruce explícito** lo hace el lector |
| Tabla de recomendaciones priorizadas 🔴🟠🟡 | Hay **hallazgos priorizados**, pero las recomendaciones accionables las redacta Claude |
| Reasignación de presupuesto por edad dentro de P1 | Los datos por edad están en sección 10; la **recomendación** la arma el lector |
| "Principio de fondo" / veredicto redactado | Es interpretación humana/Claude |

**En corto:** la auto-exhaustiva ya no se queda corta en *datos* (los trae todos y bien) ni en *detección* (auto-marca las fugas). Lo que falta para un entregable pulido es la **capa de redacción/síntesis**, que es justo lo que Claude debe poner encima — pero ahora **partiendo de la información completa, no de un agregado recortado**.

---

## 4. Conclusión

1. **Datos: verídicos** (verificado contra Graph API v24.0 en crudo, coincidencia exacta salvo centavos por dato en vivo).
2. **La auto-exhaustiva cerró la brecha**: ahora captura la Fuga #1 y el problema de CPM/geo automáticamente, y baja al detalle de cada campaña — lo que antes obligaba a llamar 5-6 herramientas a mano.
3. **Bonus**: es más consistente que mi documento hecho a mano (una sola ventana de fechas).
4. El valor restante de "armar el documento" es la **síntesis y las recomendaciones**, que Claude redacta encima de una base que ahora sí está completa.

---
*Verificación: curl directo a graph.facebook.com/v24.0 con el token de la cuenta · 2026-05-31.*
