---
name: auditoria-meta-ads
description: Auditoría completa y sistemática de una cuenta publicitaria de Meta Ads (Facebook/Instagram) usando las herramientas mcp__meta-ads. Úsala SIEMPRE que el usuario pida "auditoría", "audita", "análisis completo", "revisión", "diagnóstico", "reporte completo" o "cómo va" de una cuenta, un doctor/doctora, un cliente o una campaña de Meta/Facebook/Instagram Ads — incluso si no dice la palabra "auditoría" textual. También cuando pregunte "qué está pasando con la cuenta de X", "por qué no funcionan los anuncios de X" o "dame el panorama de X". Su valor está en garantizar que se consulten TODAS las herramientas relevantes (rendimiento, campañas, reporte completo, mensajería, configuración y segmentación) en el orden correcto, para que nunca se escape ningún dato que cambie el diagnóstico — sobre todo el embudo de mensajería de WhatsApp, donde viven las fugas que el reporte general no muestra.
---

# Auditoría completa de cuenta Meta Ads

## Propósito

Esta agencia hace marketing médico y la mayoría de las campañas son de **mensajería click-to-WhatsApp** (objetivo CONVERSATIONS / OUTCOME_ENGAGEMENT). El error más caro en una auditoría no es interpretar mal un número — es **olvidar consultar una herramienta** y dar un diagnóstico incompleto. Concretamente, el reporte general de rendimiento NO muestra los clics al enlace ni el detalle del embudo de chat; eso solo aparece en las herramientas de mensajería. Si te las saltas, vas a culpar al anuncio cuando el problema real está en el paso a WhatsApp.

Por eso esta auditoría es **exhaustiva por diseño**: recorre todas las herramientas relevantes en orden, en lugar de parar en cuanto tienes "suficientes" datos.

## Flujo obligatorio

Sigue estos pasos en orden. No te detengas a medio camino aunque ya tengas un panorama: el objetivo es completitud.

### Paso 0 — Identificar la cuenta
Si el usuario nombró a un doctor/cliente pero no diste con el `act_...`, llama a `mcp__meta-ads__listar_cuentas_publicitarias` y busca el nombre (los doctores suelen aparecer como "Dr." / "Dra." + nombre). Si hay ambigüedad entre dos cuentas parecidas, pregunta cuál antes de seguir.

### Paso 1 — Panorama de la cuenta (KPIs)
`mcp__meta-ads__reporte_rendimiento` con el `account_input`. Te da las campañas con gasto en el periodo y sus KPIs (gasto, impresiones, clics, CTR, CPM, CPC, conversaciones, CPA). Esto te dice **cuántas campañas activas hay y cuál pesa más**.

### Paso 2 — Inventario de campañas activas
`mcp__meta-ads__obtener_campanas_activas` (una cuenta) para obtener los **IDs de campaña** y sus objetivos. Los necesitas para el desglose. Ojo: pueden aparecer muchas campañas en estado "activa" pero solo unas pocas con gasto en el periodo — concéntrate en las que sí gastaron (las del Paso 1).

### Paso 3 — Desglose completo de CADA campaña con gasto
Para cada campaña con gasto, `mcp__meta-ads__reporte_completo_campana` (con `incluir_anuncios: true`). Esto trae en un solo golpe: datos generales, rendimiento, mensajería resumida, conjuntos con su segmentación, y cada anuncio con su creativo y CPA. Es el corazón de la auditoría. Incluye además:
- **Presupuesto con restante real:** la línea de presupuesto muestra "Gastado de por vida" y "Restante" tomados de `budget_remaining`. **Úsalos tal cual; NUNCA estimes el restante** restando el gasto del periodo (con presupuesto total y campañas largas, el gasto de por vida supera al del periodo y la resta da mal).
- **Desglose de entrega real** por plataforma, edad y género (gasto, conversaciones y CPA por segmento). Muestra a dónde fue de verdad el dinero, que no siempre coincide con la segmentación configurada.

### Paso 4 — Embudo de mensajería (CRÍTICO, no lo saltes)
Para cada campaña de **mensajería/WhatsApp**, `mcp__meta-ads__obtener_reporte_mensajeria`. Esto añade datos que el Paso 3 NO muestra, sobre todo los **clics en el enlace** — el número que revela la primera fuga (gente que tocó el botón pero nunca escribió). Sin este dato el embudo está incompleto.

### Paso 5 — Configuración de mensajería del conjunto
Para los conjuntos de mensajería, `mcp__meta-ads__obtener_config_mensajeria_adset`. Confirma objetivo de optimización, destino (WHATSAPP), página y atribución. Nota honesta: **NO expone el texto del mensaje de bienvenida ni las preguntas rompehielos** (eso vive en el creativo / dentro de WhatsApp Business y no lo da la API). Decláralo así en el reporte en lugar de inventarlo.

### Herramientas de apoyo (úsalas si necesitas profundizar)
- `mcp__meta-ads__obtener_segmentacion_conjunto` — segmentación detallada de un conjunto (si el reporte completo no bastó).
- `mcp__meta-ads__obtener_creativos_anuncio` — creativos de un anuncio específico.
- `mcp__meta-ads__reporte_rendimiento_desglosado` — desglose por edad/género/ubicación/dispositivo cuando sospeches que un segmento rinde distinto.
- `mcp__meta-ads__obtener_conjuntos` / `obtener_anuncios` — listados crudos.

## Cómo leer el embudo de mensajería (lo más importante)

Para campañas de WhatsApp, ordena SIEMPRE los datos como un embudo y calcula los porcentajes de paso entre etapas. Aquí es donde se ve el dinero que se pierde:

```
Impresiones
   |
Clics en el enlace           <- de obtener_reporte_mensajeria
   |   FUGA #1: clics -> conversaciones (% que escribe)
Conversaciones iniciadas
   |
Primer respuesta del negocio <- ¿contestan al 100%? si no, ahí hay un problema operativo
   |   FUGA #2: respuesta -> profundidad (% que sigue)
Llegaron a 2 mensajes
   |
Llegaron a 3 / 5 mensajes
```

**Diagnóstico de cada fuga:**
- **Fuga #1 grande (clics mucho mayores que conversaciones):** el problema está en el salto a WhatsApp — mensaje prellenado raro/largo, fricción técnica, o el botón no abre bien. NO es culpa del creativo.
- **El negocio responde al 100% pero la profundidad cae:** no es velocidad de respuesta, es **qué** contestan — el primer mensaje no engancha ni lleva a agendar. Reescribir guion.
- **El negocio NO responde a todos** (primer respuesta menor que conversaciones iniciadas): problema operativo de atención (tardan o ignoran). Eso es lo primero a arreglar.

No asumas la causa: deja que los números decidan cuál de las tres historias es la real.

Nota sobre los datos crudos: a veces la métrica de "profundidad 5 mensajes" sale mayor que la de 2 o 3 mensajes. Eso indica que esas métricas no forman un embudo perfectamente anidado (cuentan eventos algo distintos). Cuando los números se inviertan así, no fuerces un embudo descendente limpio: apóyate en los porcentajes del reporte completo y señala la inconsistencia en lugar de inventar una caída.

## Moneda

Los importes que devuelven las herramientas llevan el símbolo `$`, pero **la cuenta casi siempre está en pesos mexicanos (MXN)**, no dólares. No asumas USD. Si no estás seguro de la moneda, dilo, y al escribir el reporte usa "MXN" o "pesos" para evitar confusión. Evita pegar el símbolo `$` directamente antes de un número en el cuerpo del skill (algunos cargadores lo interpretan como variable); en el reporte final al usuario sí puedes usar el formato normal de la herramienta.

## Estructura del reporte

Entrega SIEMPRE análisis **y** recomendaciones (no solo datos). Usa esta plantilla:

```
# Auditoría — [Nombre cuenta]
[Especialidad/contexto si se conoce] | Cuenta act_xxx | Periodo: [fechas]

## 1. Resumen ejecutivo
Tabla con KPIs clave de la cuenta (gasto vs presupuesto, impresiones, alcance,
clics, CTR, CPM, CPC, conversaciones, CPA). Una frase de veredicto general.

## 2. Embudo de conversación (para campañas de WhatsApp)
El embudo con números y porcentajes de paso. Señala explícitamente las fugas y
su causa probable. Este suele ser el hallazgo más importante — ponlo arriba.

## 3. Rendimiento por anuncio / campaña
Tabla: anuncio | estado | gasto | conversaciones | CPA aprox | veredicto.
Marca el mejor (caballo de batalla), el más eficiente infrautilizado, los que
no gastan nada, y los que conviene pausar.

## 4. Segmentación
Edad, género, geo, intereses, comportamientos, placements, Advantage+.
Señala lo que mete ruido (p. ej. comportamientos sin relación con el servicio).

## 5. Recomendaciones priorizadas
Tabla con prioridad (rojo/naranja/amarillo/verde), acción concreta, y qué
fuga/problema ataca. Ordena por impacto: casi siempre arreglar el embudo de
WhatsApp rinde más que cualquier ajuste de segmentación o presupuesto.
```

## Principios de interpretación

- **El CPA real importa más que el CPA nominal.** Si una conversación cuesta, por ejemplo, 71 pesos pero solo el 17% conversa de verdad, tu costo real por prospecto interesado se multiplica (en ese ejemplo, alrededor de 430 pesos). Haz esta cuenta cuando la profundidad sea baja: comunica el impacto en dinero, no solo el porcentaje.
- **Prioriza por dinero, no por facilidad.** Mover presupuesto al anuncio más eficiente y arreglar la respuesta de WhatsApp casi siempre superan a retocar segmentación.
- **Usa el desglose de entrega para cazar segmentos caros.** Compara el CPA por plataforma, edad y género: si un segmento tiene CPA ~2x el promedio (p. ej. un género o una franja de edad que gasta mucho y convierte poco), recomiéndalo para excluir o reducir. Es una palanca concreta de eficiencia que la segmentación configurada no revela.
- **Sé honesto con los límites.** No puedes ver el contenido real de los chats de WhatsApp ni el texto del mensaje de bienvenida. Cuando el diagnóstico dependa de eso, dilo y pide al usuario 2-3 conversaciones reales caídas para cerrar el análisis.
- **Las acciones son un paso aparte.** La auditoría es de solo lectura. Si el usuario quiere ejecutar cambios (pausar anuncios, mover presupuesto), eso usa `cambiar_estado_*` y `modificar_presupuesto_*` y conviene confirmarlo antes de tocar nada en producción.

## Cuidado con respuestas gigantes

Cuentas con muchas campañas pueden generar salidas enormes (y hasta romper el envío por tamaño). Si la cuenta tiene varias campañas con gasto, audita la(s) de mayor gasto a fondo y resume el resto desde los KPIs del Paso 1, u ofrece entregar por partes. Esto evita volcar miles de líneas de golpe.
