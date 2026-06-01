import path from 'path';
import fs from 'fs';
import type { MetaAction, MetaInsight, JerarquiaConversion, Targeting, Creative, IssueInfo, ResultadoPrincipal } from './types.js';
import {
  ACCIONES,
  ACCIONES_COMPRA,
  ACCIONES_CHECKOUT,
  ACCIONES_CARRITO,
  ACCIONES_LLAMADA,
  ACCIONES_GUARDADO,
  ACCIONES_ME_GUSTA_PAGINA,
} from './types.js';

const bizSDK = require('facebook-nodejs-business-sdk');
const {FacebookAdsApi, User, AdAccount, Campaign, AdSet, Ad} = bizSDK;

export function findEnvPath(): string{
    if((process as any).pkg !== undefined){
        return path.join(path.dirname(process.execPath), '.env');
    }

    const candidates = [
        path.dirname(path.resolve(process.argv[1] ?? '')),
        __dirname,
        path.resolve(__dirname, '..', '..'),
        process.cwd()
    ];

    for(const dir of candidates){
        try{
            const p = path.join(dir, '.env');
            if(fs.existsSync(p)) return p;
        }catch{}
    }
    return path.join(candidates[0] ?? process.cwd(), '.env');
}

export function getToken():string{
    return process.env.META_ACCESS_TOKEN ?? '';
}

export function credencialesOk(): boolean{
    return getToken().length > 0;
}

export function errorCredenciales(): string{
    return 'No se encontraron credenciales de acceso';
}
export function initApi(): void{
    FacebookAdsApi.init(getToken());
}

export function cursorToArray(cursor: any): any[]{
    const arr: any[] = [];
    cursor.forEach((item: any) => arr.push(item));
    return arr;
}

export function nextCursor(cursor: any): string | null{
    const paging = cursor?.paging;
    if (!paging?.next || typeof paging.next !== 'string') return null;
    return paging.cursors?.after ?? null;
}

export function traducirEstado(status: string): string {
  const estados: Record<string, string> = {
    ACTIVE: '🟢 Activa',
    PAUSED: '⏸ Pausada',
    PENDING_REVIEW: '⏳ En revisión por Meta',
    DISAPPROVED: '❌ Rechazada',
    WITH_ISSUES: '⚠ Con problemas técnicos',
    ERROR: '❌ Error de configuración',
    CAMPAIGN_PAUSED: '⏸ Pausada (campaña madre apagada)',
    ADSET_PAUSED: '⏸ Pausada (conjunto apagado)',
    PENDING_BILLING_INFO: '💳 Sin información de facturación',
    IN_PROCESS: '⏳ Procesando',
    ARCHIVED: '🗄 Archivada',
    DELETED: '🗑 Eliminada',
  };
  return estados[status] ?? `Estatus: ${status}`;
}

export async function resolveAccount(accountInput: string): Promise<string> {
  const input = accountInput.trim();
  if (/^\d+$/.test(input)) return `act_${input}`;
  if (input.toLowerCase().startsWith('act_')) return input;
  try {
    initApi();
    const cursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
    const accounts = cursorToArray(cursor);
    const match = accounts.find((a: any) =>
      (a.name ?? '').toLowerCase().includes(input.toLowerCase()),
    );
    if (match) return match.id;
  } catch {}
  return `act_${input}`;
}

export function money(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function rangoPorDefecto(fechaInicio?: string, fechaFin?: string, dias = 30): { fInicio: string; fFin: string } {
  const hoy = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - dias);
  return {
    fInicio: fechaInicio ?? desde.toISOString().split('T')[0],
    fFin: fechaFin ?? hoy.toISOString().split('T')[0],
  };
}

export function resolverObjeto(objetoId: string | undefined, objetoTipo: string, accountId: string): any {
  if (!objetoId) return new AdAccount(accountId);
  const constructores: Record<string, any> = { campana: Campaign, conjunto: AdSet, anuncio: Ad };
  return new (constructores[objetoTipo] ?? Campaign)(objetoId);
}

export function presupuestoStr(daily?: string, lifetime?: string): string {
  if (daily) return `$${(parseInt(daily) / 100).toFixed(2)}/día`;
  if (lifetime) return `$${(parseInt(lifetime) / 100).toFixed(2)} total`;
  return 'no definido';
}

export function presupuestoDetalle(daily?: string, lifetime?: string, remaining?: string): string {
  const base = presupuestoStr(daily, lifetime);
  if (remaining == null || remaining === '') return base;
  const rem = parseInt(remaining) / 100;
  if (lifetime) {
    const gastado = parseInt(lifetime) / 100 - rem;
    return `${base} | Gastado de por vida: $${gastado.toFixed(2)} | Restante: $${rem.toFixed(2)}`;
  }
  return `${base} | Restante: $${rem.toFixed(2)}`;
}


export function formatInsightRow(i: MetaInsight, indent = ''): string {
  const actions = i.actions ?? [];
  const costActions = i.cost_per_action_type ?? [];

  const jerarquiaConversiones: JerarquiaConversion[] = [
    {keywords: ['purchase'], label: 'compras'},
    {keywords: ['lead', 'lead_grouped', 'schedule', 'submit_application'], label: 'Leads/Citas'},
    {keywords: ['messaging_conversation_started'], label: 'Mensajes Iniciados'},
    {keywords: ['add_to_cart', 'initiate_checkout'], label: 'Intenciones'},
    {keywords: ['landing_page_view'], label: 'Visitas web'},
    {keywords: ['link_click'], label: 'Clics'}
  ];

  let labelConv = 'Conversiones';
  let valorConv = '0';
  let targetType = 'purchase';

  for(const n of jerarquiaConversiones){
    const accionEncontrada = actions.find((a: MetaAction) => n.keywords.some((kw) => a.action_type.includes(kw)));
    if(accionEncontrada){
      labelConv = n.label;
      valorConv = accionEncontrada.value;
      targetType = accionEncontrada.action_type;
      break;
    }
  }

  const cpaMatch = costActions.find((a: MetaAction) => a.action_type === targetType);
  const cpa: string = cpaMatch ? `$${parseFloat(cpaMatch.value).toFixed(2)}` : 'N/A';

  const metricasMensajes: MetaAction[] = actions.filter((a: MetaAction) => a.action_type.includes('messaging'));
  let desgloseMensajeria: string = '';
  if(metricasMensajes.length > 0){
    desgloseMensajeria = `\n${indent}  --- Desglose de Chat ---`;
    for(const m of metricasMensajes){
      const nombreLimpio = m.action_type.replace('onsite_conversion.', '');
      desgloseMensajeria += `\n${indent}  * ${nombreLimpio}: ${m.value}`;
    }
  }

  const spend: string = i.spend ? parseFloat(i.spend).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '0.00';
  const cpm: string = i.cpm ? parseFloat(i.cpm).toFixed(2) : '0.00';
  const cpc: string = i.cpc ? parseFloat(i.cpc).toFixed(2) : '0.00';
  const ctr: string = i.ctr ? parseFloat(i.ctr).toFixed(2) : '0.00';
  const roas: string = i.purchase_roas?.[0]?.value ?? 'N/A';

  return (
    `${indent}Campaña: ${i.campaign_name ?? 'N/A'}\n` +
    `${indent}  Impresiones : ${parseInt(i.impressions ?? '0', 10).toLocaleString('es-MX')}\n` +
    `${indent}  Alcance     : ${parseInt(i.reach ?? '0', 10).toLocaleString('es-MX')}\n` +
    `${indent}  Clics       : ${parseInt(i.clicks ?? '0', 10).toLocaleString('es-MX')}\n` +
    `${indent}  CTR         : ${ctr}%\n` +
    `${indent}  Gasto       : $${spend}\n` +
    `${indent}  CPM         : $${cpm}\n` +
    `${indent}  CPC         : $${cpc}\n` +
    `${indent}  ${labelConv}: ${valorConv}\n` +
    `${indent}  CPA (${labelConv}): ${cpa}\n` +
    `${indent}  ROAS        : ${roas}` +
    desgloseMensajeria + `\n`
  );
}

export function procesarIssues(issues: IssueInfo[] | undefined, indent = '  '): string {
  if (!issues || issues.length === 0) return '';

  let texto = `\n${indent}🚨 Diagnóstico de problemas:`;
  for (const issue of issues) {
    const nivel = issue.level ? ` (${issue.level})` : '';
    texto += `\n${indent}  - [${issue.error_summary ?? 'Problema'}]${nivel} ${issue.error_message ?? ''}`;
  }
  return texto;
}

export function formatSegmentacion(targeting: Targeting | null | undefined, indent = ''): string[] {
  if (!targeting) return [`${indent}(Sin datos de segmentación definidos)`];
  const L: string[] = [];
  const p = (s: string) => L.push(`${indent}${s}`);

  p('📊 CONFIGURACIÓN DE AUDIENCIA:');
  p(`• 👥 Edades: ${targeting.age_min ?? 'Cualquiera'} a ${targeting.age_max ?? 'Cualquiera'} años`);
  const genders: number[] | undefined = targeting.genders;
  let generoStr = 'Todos';
  if (JSON.stringify(genders) === '[1]') generoStr = 'Hombres';
  else if (JSON.stringify(genders) === '[2]') generoStr = 'Mujeres';
  p(`• ⚥ Género: ${generoStr}`);

  const locales = targeting.locales ?? [];
  if (locales.length) {
    const idiomas = locales.map((l: any) => (typeof l === 'object' ? String(l.name ?? l.id ?? l) : String(l)));
    p(`• 🗣 Idiomas: ${idiomas.join(', ')}`);
  } else {
    p('• 🗣 Idiomas: Todos los idiomas');
  }

  const geo = (targeting.geo_locations ?? {}) as Record<string, any>;
  p('📍 UBICACIONES GEOGRÁFICAS:');
  const tiposGeo: Record<string, string> = {
    countries: 'Países',
    regions: 'Regiones/Estados',
    cities: 'Ciudades',
    zips: 'Códigos Postales',
    places: 'Lugares / Negocios (Pines con nombre)',
    custom_locations: 'Radios personalizados (Pines)',
  };
  let hayGeo = false;
  for (const [clave, etiqueta] of Object.entries(tiposGeo)) {
    const items = geo[clave] ?? [];
    if (items.length) {
      hayGeo = true;
      p(`  ▪ ${etiqueta}:`);
      for (const item of items) {
        if (typeof item === 'object') {
          const radio = item.radius ? ` (+${item.radius} ${item.distance_unit})` : '';
          if (item.name || item.key) {
            const coords = item.latitude != null ? ` [${(item.latitude as number).toFixed(4)}, ${(item.longitude as number).toFixed(4)}]` : '';
            p(`    - ${item.name ?? item.key}${radio}${coords}`);
          } else if ('latitude' in item) {
            p(`    - Lat ${(item.latitude as number).toFixed(4)}, Lon ${(item.longitude as number).toFixed(4)}${radio}`);
          } else {
            p('    - Desconocido');
          }
        } else {
          p(`    - ${item}`);
        }
      }
    }
  }
  const locationTypes: string[] = geo.location_types ?? [];
  if (locationTypes.length) {
    const tradPresencia: Record<string, string> = {
      home: 'Viven en la zona',
      recent: 'Estuvieron recientemente',
      travel_in: 'De viaje en la zona',
      recent_traveler: 'Viajeros recientes',
    };
    p(`  ▪ Tipo de presencia: ${locationTypes.map((x) => tradPresencia[x] ?? x).join(', ')}`);
  }
  if (!hayGeo) p('  ▪ Abierta (Sin restricciones geográficas específicas)');

  const customAud = targeting.custom_audiences ?? [];
  if (customAud.length) {
    p('👥 PÚBLICOS PERSONALIZADOS / SIMILARES INCLUIDOS:');
    for (const aud of customAud) p(`  ▪ ${aud.name ?? 'ID: ' + aud.id}`);
  }
  const excludedCustomAud = targeting.excluded_custom_audiences ?? [];
  if (excludedCustomAud.length) {
    p('🚫 PÚBLICOS PERSONALIZADOS EXCLUIDOS:');
    for (const aud of excludedCustomAud) p(`  ▪ ${aud.name ?? 'ID: ' + aud.id}`);
  }

  const flexible = targeting.flexible_spec ?? [];
  if (flexible.length) {
    p('🎯 INCLUSIONES DE SEGMENTACIÓN DETALLADA:');
    flexible.forEach((bloque: any, idx: number) => {
      p(`  ▪ Bloque de Coincidencia #${idx + 1} (Cumplir al menos uno):`);
      for (const clave of ['interests', 'behaviors', 'demographics']) {
        const items = bloque[clave] ?? [];
        if (items.length) {
          const tipo = clave === 'interests' ? 'Intereses' : clave === 'behaviors' ? 'Comportamientos' : 'Datos Demográficos';
          p(`    🔹 ${tipo}:`);
          for (const item of items) p(`      - ${item.name} (ID: ${item.id})`);
        }
      }
    });
  }
  const exclusions = targeting.exclusions ?? {};
  if (Object.keys(exclusions).length) {
    p('❌ EXCLUSIONES DE SEGMENTACIÓN DETALLADA:');
    for (const clave of ['interests', 'behaviors', 'demographics']) {
      const items = exclusions[clave] ?? [];
      if (items.length) {
        const tipo = clave === 'interests' ? 'Intereses' : clave === 'behaviors' ? 'Comportamientos' : 'Datos Demográficos';
        p(`    🔹 Excluyendo ${tipo}:`);
        for (const item of items) p(`      - ${item.name} (ID: ${item.id})`);
      }
    }
  }

  p('📱 UBICACIONES DE ANUNCIOS (PLACEMENTS):');
  if (!targeting.publisher_platforms) {
    p('  ▪ Ubicaciones Advantage+ (Automáticas - Recomendado por Meta)');
  } else {
    p(`  ▪ Dispositivos: ${(targeting.device_platforms ?? []).join(', ')}`);
    p(`  ▪ Plataformas: ${(targeting.publisher_platforms ?? []).join(', ')}`);
    const posiciones = [
      ...(targeting.facebook_positions ?? []),
      ...(targeting.instagram_positions ?? []),
      ...(targeting.messenger_positions ?? []),
      ...(targeting.audience_network_positions ?? []),
    ];
    if (posiciones.length) p(`  ▪ Posiciones específicas: ${posiciones.join(', ')}`);
  }

  p('⚙️ OPTIMIZACIÓN Y CONFIGURACIÓN AVANZADA:');
  const automation = targeting.targeting_automation ?? {};
  const advAudiencia = automation.advantage_audience;
  const advTxt = advAudiencia === 1 ? '🟢 Activado (Meta amplía la audiencia)'
    : advAudiencia === 0 ? '⏸ Desactivado (segmentación fija)'
    : 'No definido';
  p(`  ▪ Advantage+ Audience: ${advTxt}`);
  if (targeting.user_age_unknown !== undefined) {
    p(`  ▪ Incluir usuarios de edad desconocida: ${targeting.user_age_unknown ? 'Sí' : 'No'}`);
  }
  const brandSafety: string[] = targeting.brand_safety_content_filter_levels ?? [];
  if (brandSafety.length) p(`  ▪ Idoneidad de marca: ${brandSafety.join(', ')}`);

  return L;
}

// Traduce el objetivo (objective) de Meta a su nombre humano en español.
export function traducirObjetivo(objective?: string): string {
  const o = (objective ?? '').toUpperCase();
  const mapa: Record<string, string> = {
    OUTCOME_ENGAGEMENT: 'Interacción',
    OUTCOME_LEADS: 'Clientes potenciales',
    OUTCOME_SALES: 'Ventas',
    OUTCOME_TRAFFIC: 'Tráfico',
    OUTCOME_AWARENESS: 'Reconocimiento',
    OUTCOME_APP_PROMOTION: 'Promoción de app',
    // Objetivos legacy (campañas antiguas)
    MESSAGES: 'Mensajes',
    PAGE_LIKES: 'Me gusta de la página',
    LINK_CLICKS: 'Tráfico',
    POST_ENGAGEMENT: 'Interacción',
    VIDEO_VIEWS: 'Reproducciones de video',
    REACH: 'Alcance',
    BRAND_AWARENESS: 'Reconocimiento de marca',
    LEAD_GENERATION: 'Generación de clientes potenciales',
    CONVERSIONS: 'Conversiones',
    PRODUCT_CATALOG_SALES: 'Ventas del catálogo',
    EVENT_RESPONSES: 'Respuestas a eventos',
  };
  return mapa[o] ?? (objective ?? 'N/A');
}

export function formatTasasChat(insight: MetaInsight | undefined, indent = ''): string[] {
  const actions: MetaAction[] = insight?.actions ?? [];
  if (!actions.length) return [];
  const val = (type: string) => {
    const m = actions.find((a) => a.action_type === type);
    return m ? parseFloat(m.value) : 0;
  };
  const conn = val(ACCIONES.CONTACTO_MENSAJERIA);
  const start = val(ACCIONES.CONVERSACION_INICIADA);
  const d2 = val(ACCIONES.PROFUNDIDAD_2);
  const d3 = val(ACCIONES.PROFUNDIDAD_3);
  const d5 = val(ACCIONES.PROFUNDIDAD_5);
  if (start === 0 && conn === 0) return [];
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : 'N/A');
  const L: string[] = [];
  const p = (s: string) => L.push(`${indent}${s}`);
  p('📉 AVANCE DE LA CONVERSACIÓN (dónde se cae la gente):');
  if (conn > 0) p(`  • Contactos → Iniciaron conversación: ${pct(start, conn)} (${start}/${conn})`);
  if (start > 0) {
    p('  • De quienes iniciaron, profundizaron en el chat:');
    p(`      - alcanzaron 2 mensajes: ${pct(d2, start)} (${d2})`);
    p(`      - alcanzaron 3 mensajes: ${pct(d3, start)} (${d3})`);
    p(`      - alcanzaron 5 mensajes: ${pct(d5, start)} (${d5})`);
  }
  return L;
}

// Devuelve una alerta de eficiencia para un anuncio comparado con el CPA promedio de la campaña.
export function alertaCpa(adSpend: number, adConv: number, cpaPromedio: number): string {
  if (adConv === 0) {

    if (adSpend > 0 && (cpaPromedio === 0 || adSpend >= cpaPromedio)) return ' 🔴 gastó sin conversaciones';
    return '';
  }
  const cpa = adSpend / adConv;
  if (cpaPromedio > 0 && cpa > cpaPromedio * 1.5) return ` ⚠ CPA ${(cpa / cpaPromedio).toFixed(1)}x sobre promedio`;
  return '';
}

// Clasifica el TIPO real de un conjunto a partir de su optimization_goal + destination_type.
export function clasificarTipo(optimizationGoal?: string, destinationType?: string): string {
  const og = (optimizationGoal ?? '').toUpperCase();
  const dt = (destinationType ?? '').toUpperCase();
  const esDestinoMensajeria = ['WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING'].some((k) => dt.includes(k));

  if (og === 'CONVERSATIONS') return '💬 Mensajería / Conversaciones';
  if (og === 'LEAD_GENERATION' || og === 'QUALITY_LEAD') return '📝 Leads (formulario)';
  if (og === 'QUALITY_CALL' || dt.includes('PHONE_CALL')) return '📞 Llamadas';
  if (esDestinoMensajeria) return '💬 Mensajería / Conversaciones';
  if (['POST_ENGAGEMENT', 'PAGE_ENGAGEMENT', 'PAGE_LIKES', 'ENGAGED_USERS', 'EVENT_RESPONSES', 'THRUPLAY', 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS', 'VIDEO_VIEWS', 'PROFILE_AND_PAGE_ENGAGEMENT', 'PROFILE_VISIT', 'VISIT_INSTAGRAM_PROFILE', 'REMINDERS_SET'].includes(og))
    return '👍 Interacciones / Engagement';
  if (dt === 'ON_AD') return '📝 Leads (formulario)';
  if (['LINK_CLICKS', 'LANDING_PAGE_VIEWS'].includes(og)) return '🔗 Tráfico';
  if (['OFFSITE_CONVERSIONS', 'ONSITE_CONVERSIONS', 'VALUE'].includes(og)) return '🛒 Conversiones (web)';
  if (['REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT'].includes(og)) return '📣 Alcance';
  return `❓ Otro (${optimizationGoal ?? 'N/D'})`;
}

// Fallback: clasifica por el objetivo de la campaña cuando no hay conjuntos para inferir.
export function clasificarPorObjetivo(objective?: string): string {
  const o = (objective ?? '').toUpperCase();
  const mapa: Record<string, string> = {
    OUTCOME_ENGAGEMENT: '👍 Interacciones / Engagement',
    OUTCOME_LEADS: '📝 Leads (formulario)',
    OUTCOME_SALES: '🛒 Conversiones (web)',
    OUTCOME_TRAFFIC: '🔗 Tráfico',
    OUTCOME_AWARENESS: '📣 Alcance',
    OUTCOME_APP_PROMOTION: '📱 Promoción de app',
    MESSAGES: '💬 Mensajería / Conversaciones',
    CONVERSATIONS: '💬 Mensajería / Conversaciones',
    LEAD_GENERATION: '📝 Leads (formulario)',
    LINK_CLICKS: '🔗 Tráfico',
    CONVERSIONS: '🛒 Conversiones (web)',
    PRODUCT_CATALOG_SALES: '🛒 Conversiones (web)',
    POST_ENGAGEMENT: '👍 Interacciones / Engagement',
    PAGE_LIKES: '👍 Interacciones / Engagement',
    EVENT_RESPONSES: '👍 Interacciones / Engagement',
    VIDEO_VIEWS: '👍 Interacciones / Engagement',
    REACH: '📣 Alcance',
    BRAND_AWARENESS: '📣 Alcance',
    LOCAL_AWARENESS: '📣 Alcance',
    STORE_VISITS: '📣 Alcance',
    APP_INSTALLS: '📱 Promoción de app',
  };
  return mapa[o] ?? `❓ ${objective ?? 'N/D'}`;
}

export function esTipoMensajeria(tipo: string): boolean {
  return tipo.includes('Mensajería');
}


export function truncar(texto: string, maxCodePoints: number, sufijo = '…'): string {
  const puntos = Array.from(texto);
  if (puntos.length <= maxCodePoints) return texto;
  return puntos.slice(0, maxCodePoints).join('') + sufijo;
}


export function sanitizarTexto(texto: string): string {
  return texto.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '�',
  );
}

const ETIQUETAS_DESGLOSE: Record<string, string> = {
  male: 'Hombres', female: 'Mujeres', unknown: 'Desconocido',
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
  audience_network: 'Audience Network', whatsapp: 'WhatsApp',
  threads: 'Threads', oculus: 'Meta Quest',
  feed: 'Feed', facebook_stories: 'Stories FB', instagram_stories: 'Stories IG',
  instagram_reels: 'Reels IG', facebook_reels: 'Reels FB', reels: 'Reels',
  instagram_explore: 'Explorar IG', instagram_explore_grid_home: 'Explorar IG',
  marketplace: 'Marketplace', video_feeds: 'Feed de video', story: 'Stories',
  right_hand_column: 'Columna derecha', search: 'Búsqueda', instream_video: 'Video instream',
  biz_disco_feed: 'Descubrimiento', profile_feed: 'Feed de perfil', rewarded_video: 'Video premiado',
  mobile_app: 'App móvil', mobile_web: 'Web móvil', desktop: 'Escritorio', unknown_device: 'Desconocido',
  android_smartphone: 'Android', iphone: 'iPhone', ipad: 'iPad', android_tablet: 'Tablet Android',
};

export function traducirSegmento(raw?: string): string {
  if (raw == null || raw === '') return '(desconocido)';
  return ETIQUETAS_DESGLOSE[raw.toLowerCase()] ?? raw;
}

export function formatDesglose(rows: MetaInsight[], clave: string, titulo: string, tipo: string, indent = ''): string[] {
  if (!rows?.length) return [`${indent}${titulo}: (sin datos en el periodo)`];
  const dineroMx = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const datos = rows
    .map((r) => {
      const spend = parseFloat(r.spend ?? '0');
      const res = detectarResultado(r, tipo);
      const c = res ? parseFloat(res.value) : 0;
      const raw = String((r as Record<string, unknown>)[clave] ?? '');
      return { seg: traducirSegmento(raw), spend, res: c, label: res?.label ?? '' };
    })
    .sort((a, b) => b.spend - a.spend);
  // Etiqueta de la columna de resultados (la primera no vacía); por defecto "result."
  const colLabel = datos.find((d) => d.label)?.label ?? 'result.';
  const L = [`${indent}${titulo}:`];
  for (const d of datos) {
    const cpa = d.res > 0 ? `$${dineroMx(d.spend / d.res)}` : '—';
    L.push(`${indent}  • ${d.seg}: gasto $${dineroMx(d.spend)} | ${colLabel}: ${d.res} | CPA: ${cpa}`);
  }
  return L;
}

export function formatCreativo(creative: Creative | undefined, indent = '', incluirMedia = false): string[] {
  if (!creative) return [];
  const L: string[] = [];
  const p = (s: string) => L.push(`${indent}${s}`);
  const tipo = creative.object_type ?? 'N/D';
  const cta = creative.call_to_action_type ?? 'sin CTA';
  p(`🎨 Creativo: ${tipo} | CTA: ${cta}`);
  if (creative.title) p(`   Título: ${creative.title}`);
  const body = (creative.body ?? '').replace(/\s+/g, ' ').trim();
  if (body) p(`   Texto: ${truncar(body, 220)}`);
  if (creative.instagram_permalink_url) p(`   Publicación: ${creative.instagram_permalink_url}`);
  if (incluirMedia && creative.thumbnail_url) p(`   Miniatura: ${creative.thumbnail_url}`);
  return L;
}

export function detectarResultado(insight: MetaInsight | undefined, tipo: string): ResultadoPrincipal | null {
  const actions: MetaAction[] = insight?.actions ?? [];
  if (!actions.length) return null;
  const get = (type: string) => actions.find((a) => a.action_type === type)?.value ?? null;
  const getFirst = (types: string[]): ResultadoPrincipal | null => {
    for (const t of types) { const v = get(t); if (v != null) return { label: '', type: t, value: v }; }
    return null;
  };
  if (tipo.includes('Mensajería')) {
    const v = get(ACCIONES.CONVERSACION_INICIADA);
    return v != null ? { label: 'Conversaciones', value: v, type: ACCIONES.CONVERSACION_INICIADA } : null;
  }
  if (tipo.includes('Leads')) {
    const v = get(ACCIONES.LEAD);
    return v != null ? { label: 'Leads', value: v, type: ACCIONES.LEAD } : null;
  }
  if (tipo.includes('Conversiones')) {
    const compra = getFirst(ACCIONES_COMPRA);
    if (compra) return { ...compra, label: 'Compras' };
    const carrito = getFirst(ACCIONES_CARRITO);
    if (carrito) return { ...carrito, label: 'Carrito' };
    return null;
  }
  if (tipo.includes('Llamadas')) {
    const r = getFirst(ACCIONES_LLAMADA);
    return r ? { ...r, label: 'Llamadas' } : null;
  }
  if (tipo.includes('Tráfico')) {
    const v = get(ACCIONES.VISITA_PAGINA);
    return v != null ? { label: 'Visitas', value: v, type: ACCIONES.VISITA_PAGINA } : null;
  }
  if (tipo.includes('Interacciones')) {
    const v = get(ACCIONES.POST_ENGAGEMENT);
    return v != null ? { label: 'Interacciones', value: v, type: ACCIONES.POST_ENGAGEMENT } : null;
  }
  return null;
}

export function mejorResultado(insight: MetaInsight | undefined): { num: number; etiqueta: string } | null {
  const actions: MetaAction[] = insight?.actions ?? [];
  if (!actions.length) return null;
  const val = (type: string) => {
    const a = actions.find((x) => x.action_type === type);
    return a ? parseInt(a.value, 10) || 0 : 0;
  };
  const valArr = (types: string[]) => {
    for (const t of types) { const v = val(t); if (v > 0) return v; }
    return 0;
  };
  const candidatos: { num: number; etiqueta: string }[] = [
    { num: val(ACCIONES.CONVERSACION_INICIADA), etiqueta: 'conversaciones' },
    { num: val(ACCIONES.LEAD), etiqueta: 'leads' },
    { num: valArr(ACCIONES_COMPRA), etiqueta: 'compras' },
    { num: valArr(ACCIONES_LLAMADA), etiqueta: 'llamadas' },
    { num: val(ACCIONES.VISITA_PAGINA), etiqueta: 'visitas' },
  ];
  for (const c of candidatos) if (c.num > 0) return c;
  return null;
}

export function formatResultado(insight: MetaInsight | undefined, tipo: string, indent = ''): string[] {
  const actions: MetaAction[] = insight?.actions ?? [];
  const costs: MetaAction[] = insight?.cost_per_action_type ?? [];
  if (!actions.length) return [];
  const get = (type: string) => actions.find((a) => a.action_type === type)?.value ?? null;
  const getFirst = (types: string[]) => {
    for (const t of types) { const v = get(t); if (v != null) return { type: t, value: v }; }
    return null;
  };
  const cost = (type: string) => {
    const m = costs.find((a) => a.action_type === type);
    return m ? `$${parseFloat(m.value).toFixed(2)}` : null;
  };
  const L: string[] = [];
  const p = (s: string) => L.push(`${indent}${s}`);

  if (tipo.includes('Leads')) {
    const v = get(ACCIONES.LEAD);
    if (v != null) p(`🎯 RESULTADO — Leads: ${v}${cost(ACCIONES.LEAD) ? ` (CPL ${cost(ACCIONES.LEAD)})` : ''}`);
  } else if (tipo.includes('Conversiones')) {
    const compra = getFirst(ACCIONES_COMPRA);
    const checkout = getFirst(ACCIONES_CHECKOUT);
    const carrito = getFirst(ACCIONES_CARRITO);
    const leads = get(ACCIONES.LEAD);
    if (compra) p(`🎯 RESULTADO — Compras: ${compra.value}${cost(compra.type) ? ` (CPA ${cost(compra.type)})` : ''}`);
    else if (leads != null) p(`🎯 RESULTADO — Conversiones (leads): ${leads}${cost(ACCIONES.LEAD) ? ` (CPA ${cost(ACCIONES.LEAD)})` : ''}`);
    else p('🎯 RESULTADO — Sin compras registradas en el periodo');
    if (checkout) p(`   ↳ Pagos iniciados: ${checkout.value}`);
    if (carrito) p(`   ↳ Agregados al carrito: ${carrito.value}`);
  } else if (tipo.includes('Llamadas')) {
    const r = getFirst(ACCIONES_LLAMADA);
    if (r) p(`🎯 RESULTADO — Llamadas: ${r.value}${cost(r.type) ? ` (costo ${cost(r.type)})` : ''}`);
    else p('🎯 RESULTADO — Sin llamadas registradas en el periodo');
    const conn20 = get(ACCIONES.LLAMADA_20S);
    if (conn20 != null) p(`   ↳ Llamadas conectadas (≥20s): ${conn20}`);
  } else if (tipo.includes('Tráfico')) {
    const lpv = get(ACCIONES.VISITA_PAGINA);
    if (lpv != null) p(`🎯 RESULTADO — Visitas a la página de destino: ${lpv}${cost(ACCIONES.VISITA_PAGINA) ? ` (costo ${cost(ACCIONES.VISITA_PAGINA)})` : ''}`);
  } else if (tipo.includes('Interacciones')) {
    const pe = get(ACCIONES.POST_ENGAGEMENT);
    if (pe != null) p(`🎯 RESULTADO — Interacciones con la publicación: ${pe}${cost(ACCIONES.POST_ENGAGEMENT) ? ` (costo ${cost(ACCIONES.POST_ENGAGEMENT)})` : ''}`);
    const partes: string[] = [];
    const reac = get(ACCIONES.REACCION); if (reac != null) partes.push(`Reacciones: ${reac}`);
    const com = get(ACCIONES.COMENTARIO); if (com != null) partes.push(`Comentarios: ${com}`);
    const sh = get(ACCIONES.COMPARTIDO); if (sh != null) partes.push(`Compartidos: ${sh}`);
    const sav = getFirst(ACCIONES_GUARDADO); if (sav) partes.push(`Guardados: ${sav.value}`);
    const vv = get(ACCIONES.VIDEO_VIEW); if (vv != null) partes.push(`Reprod. video: ${vv}`);
    const pl = getFirst(ACCIONES_ME_GUSTA_PAGINA); if (pl) partes.push(`Me gusta de página: ${pl.value}`);
    if (partes.length) p(`   ↳ ${partes.join(' | ')}`);
  }

  const convMsg = get(ACCIONES.CONVERSACION_INICIADA);
  if (convMsg != null && parseInt(convMsg, 10) > 0) {
    const cMsg = cost(ACCIONES.CONVERSACION_INICIADA);
    p(`💬 Además: ${convMsg} conversaciones de mensajería${cMsg ? ` (costo ${cMsg})` : ''}`);
  }
  return L;
}


export function formatResumenMensajeria(insight: MetaInsight | undefined, indent = ''): string[] {
  const actions: MetaAction[] = insight?.actions ?? [];
  const costs: MetaAction[] = insight?.cost_per_action_type ?? [];
  if (!actions.length) return [];
  const val = (type: string) => actions.find((a) => a.action_type === type)?.value ?? null;
  const cost = (type: string) => {
    const m = costs.find((a) => a.action_type === type);
    return m ? `$${parseFloat(m.value).toFixed(2)}` : null;
  };
  const L: string[] = [];
  const p = (s: string) => L.push(`${indent}${s}`);
  const conv = val(ACCIONES.CONVERSACION_INICIADA);
  const contactos = val(ACCIONES.CONTACTO_MENSAJERIA);
  const blocks = val(ACCIONES.BLOQUEO_MENSAJERIA);
  const bienvenida = val(ACCIONES.MENSAJE_BIENVENIDA);
  p('💬 MENSAJERÍA:');
  if (conv == null && contactos == null) {
    p('  🔴 0 conversaciones iniciadas — la campaña no generó resultados de mensajería');

    if (bienvenida != null) p(`  ↳ ${bienvenida} vieron el mensaje de bienvenida pero no continuaron`);
  } else {
    if (conv != null) p(`  • Conversaciones iniciadas: ${conv}${cost(ACCIONES.CONVERSACION_INICIADA) ? ` (CPA ${cost(ACCIONES.CONVERSACION_INICIADA)})` : ''}`);
    if (contactos != null) p(`  • Contactos de mensajería (total): ${contactos}`);
    const reply = val(ACCIONES.PRIMER_RESPUESTA);
    if (reply != null) p(`  • Primer respuesta del negocio: ${reply}`);
    const d2 = val(ACCIONES.PROFUNDIDAD_2);
    const d3 = val(ACCIONES.PROFUNDIDAD_3);
    const d5 = val(ACCIONES.PROFUNDIDAD_5);
    if (d2 != null || d3 != null || d5 != null) {
      p(`  • Profundidad chat → 2 msgs: ${d2 ?? 0} | 3 msgs: ${d3 ?? 0} | 5 msgs: ${d5 ?? 0}`);
    }
  }

  if (blocks != null && parseInt(blocks, 10) > 0) {
    p(`  ⚠️ ${blocks} bloqueos en Messenger — revisar configuración/experiencia del chat`);
  }
  return L;
}