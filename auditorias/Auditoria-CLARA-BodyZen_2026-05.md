# Auditoría — CLARA Body Zen Oficial 2026

**Cuenta:** `act_2222830017344` · **Giro:** estética / medicina estética (HIFU, depilación láser, facial, armonización)
**Periodo:** 2026-05-02 → 2026-06-01 (últimos 30 días) · **Moneda:** MXN (pesos)
**Tipo de cuenta:** campañas de mensajería click-to-WhatsApp (objetivo Interacción / OUTCOME_ENGAGEMENT)

> ⚠️ **Nota:** existen dos cuentas con nombre parecido — *CLARA Body Zen Oficial 2026* (`act_2222830017344`, **la activa, auditada aquí**) y *CLARA Bodyzen* (`act_2209544819864466`, **sin actividad** en el periodo). Si te referías a otra, avísame.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Gasto total (5 campañas) | **$3,183.83** |
| Conversaciones de WhatsApp iniciadas | **32** |
| CPA nominal (por conversación) | **$99.49** |
| **CPA real** (por prospecto que avanzó a 3+ mensajes) | **≈ $795** |
| Campañas activas hoy | **1 de 5** (solo *HIFU*) |

**Veredicto:** la cuenta **gasta mucho para muy pocas conversaciones reales**. El problema central **no son los anuncios** (el CTR es sano, 1.1–1.3%, y los clics son baratos): el dinero se pierde en **dos fugas dentro de WhatsApp** — la gente toca el botón pero no escribe, y quien escribe abandona el chat en los primeros mensajes. De 32 conversaciones, **solo 4 llegaron a 3 mensajes**. Ese es el verdadero costo: ~$795 por cada prospecto genuinamente interesado.

---

## 2. Embudo de conversación (lo más importante) 🔴

### Campaña *CLARA Interacción P1* — $1,762.77 (56% del gasto del mes)

```
185  Clics en el enlace (tocaron "Enviar mensaje")
 60  Vieron el mensaje de bienvenida en WhatsApp   ← 32% de los que clicaron
 22  Iniciaron conversación                         ← 12% de los que clicaron  🔴 FUGA #1
 22  El negocio respondió (primera respuesta)       ← 100% ✅ (operativa OK)
 10  El usuario volvió a responder
  9  Llegaron a 2 mensajes
  4  Llegaron a 3 mensajes                           ← 18% de las conversaciones  🔴 FUGA #2
  0  Llegaron a 5 mensajes
  1  Bloqueo en Messenger
```

- **CPA nominal:** $80 / conversación · **CPA real:** **$1,762.77 ÷ 4 = $440.69** por prospecto interesado.

### Campaña *HIFU* (activa) — $845.80

```
 30  Clics en el enlace
  3  Conversaciones iniciadas    ← 10% de los que clicaron  🔴 FUGA #1
  3  Primera respuesta del negocio (100%)
  0  Llegaron a 2 / 3 / 5 mensajes   ← el chat muere de inmediato  🔴 FUGA #2
```

- **CPA:** $211 / conversación · **CPA real:** indefinido (0 prospectos profundizaron).

### Diagnóstico de las fugas

- **🔴 Fuga #1 — del clic a la conversación (≈ 88–90% se pierde aquí).** Cientos tocan "Enviar mensaje" pero nunca escriben. El salto a WhatsApp está roto: en P1, **60 vieron el mensaje de bienvenida y solo 22 siguieron** → el problema está en el **mensaje prellenado / de bienvenida**, no en el anuncio. Esta es la fuga más cara de toda la cuenta.
- **🔴 Fuga #2 — profundidad del chat.** El negocio **responde al 100%** (no es problema de velocidad de atención), pero la conversación se apaga: solo 18% llega a 3 mensajes en P1 y **0% en HIFU**. Es **qué** se contesta: el guion no engancha ni lleva a agendar.

> 🔍 **Límite honesto:** no puedo ver el contenido de los chats ni el texto del mensaje de bienvenida (no lo expone la API). El dato "60 vieron bienvenida → 22 iniciaron" apunta fuerte a ese mensaje. **Para cerrar el diagnóstico, comparte 2-3 conversaciones que se cayeron** y el texto del mensaje de bienvenida de WhatsApp.

---

## 3. Rendimiento por campaña

| Campaña | Estado | Gasto | Conv. | CPA/conv | Lectura |
|---|---|---|---|---|---|
| **CLARA Interacción P1** | ⏸ Pausada | $1,762.77 | 22 | $80 | Mayor volumen; murió en profundidad |
| **Campaña HIFU** (activa) | 🟢 Activa | $845.80 | 4 | $211 | CPM carísimo ($142), 0 profundidad |
| clara Tráfico | ⏸ Pausada | $256.22 | 3 | $85 | 364 clics baratos pero **no** se vuelven chats |
| clara body Clientes potenciales | ⏸ Pausada | $181.85 | 1 | $182 | Inviable |
| clara Ventas | ⏸ Pausada | $137.19 | 2 | $69 | Mejor CPA del grupo, pero volumen mínimo |

**Hallazgos:**
- La **HIFU activa tiene CPM $142.36** vs $54 de P1 — **2.6x más cara de entregar**. Causa: segmentación geográfica de **7 pines puntuales** (Club de Golf Bellavista, Satélite, Echegaray, Zona Esmeralda, Lomas Verdes…) que **asfixia la entrega** y dispara el costo. A $211/conversación es insostenible.
- *clara Tráfico* trajo **364 clics a $0.70** (tráfico barato) pero **solo 3 conversaciones**: el objetivo "Tráfico" atrae clics que no se convierten en mensajes. No aporta al negocio.
- **5 campañas con 5 objetivos distintos en 30 días** (Clientes potenciales, Ventas, Interacción, Tráfico, HIFU) → fragmenta el aprendizaje de Meta y reparte mal el presupuesto.
- **Creativos sanos:** CTR 1.1–2.5%, textos bien escritos, publicacilones de Instagram reales. El probsi, lema no está aquí.
- **CTA inconsistente:** HIFU usa `WHATSAPP_MESSAGE` (directo a WhatsApp ✅); P1 y las demás usan `MESSAGE_PAGE` (va al inbox de la página, **más fricción** → contribuye a la Fuga #1).

---

## 4. Segmentación (entrega real)

**Por edad (CLARA Interacción P1):**

| Edad | Gasto | Conv. | CPA |
|---|---|---|---|
| 18-24 | $407.69 | 7 | **$58** ✅ |
| 45-54 | $192.82 | 4 | **$48** ✅ |
| 55-64 | $47.83 | 2 | $24 ✅ |
| 35-44 | $418.57 | 5 | $84 |
| **25-34** | **$681.27** | **4** | **$170** 🔴 |
| 65+ | $14.59 | 0 | — |

→ El segmento **25-34 se comió el mayor presupuesto ($681) y dio el peor CPA ($170)**. Los baratos (18-24, 45-64) recibieron menos dinero. **Hay margen claro de reasignación.**

**Por género:**
- En P1, **$462 (26% del gasto) se fue a Hombres** con CPA $115 (vs $72 en Mujeres) — **pese a que el conjunto está segmentado a "Mujeres"**. Revisar por qué se está entregando a hombres.
- En HIFU (género "Todos"), **Mujeres gastó $616 por 2 conversaciones = CPA $308**, Hombres $39 por 1 = $39. Aquí Mujeres salió carísimo.

---

## 5. Recomendaciones priorizadas

| Prioridad | Acción | Ataca |
|---|---|---|
| 🔴 **1** | **Revisar y reescribir el mensaje de bienvenida de WhatsApp.** 60 lo vieron y solo 22 siguieron. Pedir al cliente el texto actual + 2-3 chats caídos. | Fuga #1 (88-90% del dinero) |
| 🔴 **2** | **Reescribir el guion de respuesta** para que enganche y lleve a agendar. El negocio responde 100% pero el chat muere antes de 3 mensajes. | Fuga #2 |
| 🟠 **3** | **HIFU: ampliar el radio geográfico** (consolidar los 7 pines o subir a +5 km / zona más amplia). El CPM $142 y el CPA $211 vienen de una audiencia demasiado chica. | CPM/CPA HIFU |
| 🟠 **4** | **Reasignar presupuesto en P1**: bajar 25-34 (gastó $681 por 4 conv) y subir 18-24 y 45-64 (CPA $48-58). | Eficiencia |
| 🟠 **5** | **Revisar la fuga de gasto a Hombres** ($462 en P1 pese a segmentar Mujeres). Confirmar la configuración de género. | Desperdicio |
| 🟡 **6** | **Unificar el CTA a `WHATSAPP_MESSAGE` directo** en todas las campañas (como HIFU), en vez de `MESSAGE_PAGE`. | Fuga #1 |
| 🟡 **7** | **Consolidar estructura**: dejar de correr 5 objetivos a la vez. Pausar/reconvertir "Tráfico" (no genera conversaciones) y concentrar presupuesto en el formato de mensajería que mejor CPA real dé. | Aprendizaje |

---

### Principio de fondo

El dinero **no se está perdiendo en los anuncios** (creativos y CTR están bien). Se pierde **dentro de WhatsApp**: el mensaje de bienvenida frena al 88% y el guion no cierra. **Arreglar esos dos textos rinde más que cualquier ajuste de segmentación o presupuesto** — hoy se paga ~$795 por cada prospecto que de verdad conversa.

> Esta auditoría es de **solo lectura**. Cualquier cambio (pausar, mover presupuesto, ampliar geo) se ejecuta aparte y conviene confirmarlo antes de tocar la cuenta en producción.

---
*Generado el 2026-05-31 · Fuente: API de Meta Marketing (insights last_30d) · Auditoría asistida por MCP Meta Ads.*
