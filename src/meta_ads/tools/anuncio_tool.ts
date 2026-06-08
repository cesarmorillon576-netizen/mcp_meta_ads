//import {server} from '../server';
import { getApiClient, getServer } from "../builders";
import { getToken } from "../helper";
import {API_BASE} from "../builders";
import { credencialesOk } from "../helper";
import {errorCredenciales} from "../helper";
import { z } from 'zod';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

interface range{
    since:String,
    until:string
}
export function ToolRegister(server:McpServer){
server.registerTool(
    'interacion_horas_por_anuncio',
    {
        description:'utilizar esta herramienta cuando se quiera saber las interaciones con el anuncio compaginadas por hora con respecto a la zona horaria del anuncio. complementar con interacion_horas_por_audiencia',
        inputSchema:{
            add_id: z.string(),
            time_range: z.object({
                since:z.string(),
                until:z.string()
            }).describe('YYYY-MM-DD')
        }
    },
    async ({add_id,time_range})=>{
        const params: Record<string,string|any> = {
            level:'ad',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            }),
            fields:'clicks,impressions,spend,reach,frequency',
            breakdowns:'hourly_stats_aggregated_by_advertiser_time_zone'
        }
        try{
          const data = await  getApiClient().fetchData(`${add_id}/insights`,params)
        const json = await data.json();
        if(!json?.data){
          return {content:[{type:'text',text:'no data available'}]}
        }
        if(!json?.data?.[0]){
          return {content:[{type:'text',text:'no data available'}]}
        }
        let response:string = ''
        response = `fecha de inicio: ${json.data[0].date_start}| fecha de cierre: ${json.data[0].date_stop} \n`;
        response+= 'Informacion de impresiones por rango de hora \n'
        json.data.forEach((data:any) => {
          response +=`impresiones: ${data.impressions} | gasto: ${data.spend} |clicks: ${data.clicks} |audiencia captada: ${data.reach} | frecencia de vistas: ${data.frequency} | rango de horas ${data.hourly_stats_aggregated_by_advertiser_time_zone} \n`
        });
        return {content:[{type:'text',text:response}]};
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)

server.registerTool(
    'interacion_horas_por_audiencia',
    {
        description:'utilizar esta herramienta cuando se quiera saber las interaciones con el anuncio compaginadas por hora con respecto a la audiencia. complementar con interacion_horas_por_anuncio',
        inputSchema:{
            add_id: z.string(),
            time_range: z.object({
                since:z.string(),
                until:z.string()
            }).describe('YYYY-MM-DD')
        }
    },
    async ({add_id,time_range})=>{
        const params: Record<string,string|any> = {
            level:'ad',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            }),
            fields:'clicks,impressions,spend,reach,frequency',
            breakdowns:'hourly_stats_aggregated_by_audience_time_zone'
        }
        try{
          const data = await  getApiClient().fetchData(`${add_id}/insights`,params)
        const json = await data.json();
        if(!json?.data){
          return {content:[{type:'text',text:'no data available'}]}
        }
        if(!json?.data?.[0]){
          return {content:[{type:'text',text:'no data available'}]}
        }
        let response:string = ''
        response = ` fecha de inicio: ${json.data[0].date_start}| fecha de cierre: ${json.data[0].date_stop} \n`;
        response+= 'Informacion de impresiones por rango de hora \n'
        json.data.forEach((data:any) => {
          response +=`impresiones: ${data.impressions} | gasto: ${data.spend}|clicks: ${data.clicks} |audiencia captada: ${data.reach} | frecencia de vistas: ${data.frequency}  | rango de horas ${data.hourly_stats_aggregated_by_audience_time_zone} \n`
        });
        return {content:[{type:'text',text:response}]};
        }catch(e:any){
          return {content:[{type:'text',text:JSON.stringify(e.message)}]}
        }
    }
)

server.registerTool(
    'conversaciones_por_hora_add',
    {
        description:'utilizar esta herramienta cuando se quiera saber las conversaciones por anuncio por hora.',
        inputSchema:{
            add_id: z.string(),
            time_range: z.object({
                since:z.string(),
                until:z.string()
            }).describe('YYYY-MM-DD')
        }
    },
    async ({add_id,time_range})=>{
        const params: Record<string,string|any> = {
            level:'ad',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            }),
            fields:'actions',
            breakdowns:'hourly_stats_aggregated_by_audience_time_zone'
   
        }
        try{
          const data = await  getApiClient().fetchData(`${add_id}/insights`,params)
        const json = await data.json();
        if(!json?.data){
          return {content:[{type:'text',text:'no data available'}]}
        }
        if(!json?.data?.[0]){
          return {content:[{type:'text',text:'no data available'}]}
        }

        let response:string = ''
        response = ` fecha de inicio: ${json.data[0].date_start}| fecha de cierre: ${json.data[0].date_stop} \n`;
        response+= 'Informacion de conversaciones por rango de hora \n'
        json.data.forEach((data:any) => {
          if(data.actions){
            let hasConversations = false;
            let hasResponses = false;
              data.actions.forEach((action:any) => {
                if(action.action_type == 'link_click'){
                  response += `Click al link: ${action.value}`
                }
                if(action.action_type == 'onsite_conversion.total_messaging_connection'){
                  response += ` conversaciones: valor: ${action.value}`
                  hasConversations = true;
                }
                if(action.action_type == 'onsite_conversion.messaging_first_reply'){
                  response +=`respuestas: valor: ${action.value}`;
                  hasResponses = true;
                }
              });
              if(!hasConversations){
                  response +=`conversaciones:0`
              }
              if (!hasResponses){
                response+= 'respuestas: 0';
              }
             response +=`rango de horas ${data.hourly_stats_aggregated_by_audience_time_zone} \n`
          }else{
            response +=`no se detectaron convesaciones ni clicks al link en este ragno de fecha: ${data.hourly_stats_aggregated_by_audience_time_zone} \n`
          }
          
        });
        return {content:[{type:'text',text:response}]};
        }catch(e:any){
          return {content:[{type:'text',text:JSON.stringify(e?.message)}]}
        }
    }
)

server.registerTool(
    'obtener_conversaciones_fuente_anuncio',
    {
        description:'utilizar esta tool cuando se requiera obtener las fuentes de las conversaciones whatsapp/instagram/facebook',
        inputSchema:{
            add_id: z.string(),
            time_range: z.object({
                since:z.string(),
                until:z.string()
            }).describe('YYYY-MM-DD')
        }
    },
    async ({add_id,time_range})=>{
        const params: Record<string,string|any> = {
            level:'ad',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            }),
            breakdowns:'publisher_platform'
        }
        try{
          const data = await  getApiClient().fetchData(`${add_id}/insights`,params)
        const json = await data.json();
        return {content:[{type:'text',text:JSON.stringify(json)}]};
        }catch(e:any){
          return {content:[{type:'text',text:JSON.stringify(e.message)}]}
        }
    }
)

server.registerTool(
    'obtener_resultados_por_edad',
    {
        description:'utilizar esta tool cuando necesites obtener los resultados de un ad por la edad',
        inputSchema:{
            ad_id:z.string(),
            time_range:z.object({
                since:z.string(),
                until:z.string()
            })
        }
    },
    async ({ad_id,time_range})=>{
        const params:Record<string,string|range> = {
            breakdowns:'age',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            })
        }
        
        try{
        const data = await getApiClient().fetchData(`${ad_id}/insights`,params)
        const json = await data.json()
        return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e:any){
          return {content:[{type:'text',text:JSON.stringify(e.message)}]}
        }
    }
)

server.registerTool(
    'obtener_resultados_por_region_anuncio',
    {
        description:'utilizar esta tool cuando necesites obtener los resultados de un ad por la region',
        inputSchema:{
            ad_id:z.string(),
            time_range:z.object({
                since:z.string(),
                until:z.string()
            })
        }
    },
    async ({ad_id,time_range})=>{
        const params:Record<string,string|range> = {
            breakdowns:'region',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            })
        }
       
        try{
 const data = await getApiClient().fetchData(`${ad_id}/insights`,params)
        const json = await data.json()
        return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)

server.registerTool(
    'obtener_resultados_por_genero_anuncio',
    {
        description:'utilizar esta tool cuando necesites obtener los resultados de un ad por el genero',
        inputSchema:{
            ad_id:z.string(),
            time_range:z.object({
                since:z.string(),
                until:z.string()
            })
        }
    },
    async ({ad_id,time_range})=>{
        const params:Record<string,string|range> = {
            breakdowns:'gender',
            time_range:JSON.stringify({
                since:time_range.since,
                until:time_range.until
            })
        }
       
        try{
 const data = await getApiClient().fetchData(`${ad_id}/insights`,params)
        const json = await data.json()
        return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)

server.registerTool(
    'obtener_informacion_general_anuncio',
    {
        description:'obtiene informacion como id,nombre,effective_status,addset.id que es al conjunto que pertenece, utilizar esta tool cuando se quiera iniciar con la investigacion inicial de un anuncio de una campaña especifica',
        inputSchema:{
            ad_id:z.string()
        }
    },
    async ({ad_id})=>{
        const params: Record<string,string> = {
            fields:'id,name,effective_status,adset'
        }
       
        try{
 const data = await  getApiClient().fetchData(`${ad_id}`,params)
        const json = await data.json();
        return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)


server.registerTool(
    'obtener_metadata_post',
    {
        description:'obtener el titulo,cuerpo,nombre del reel, la url de la metadata para analisis (administrativo), usar esta tool para cuando se requiera sacar meta data del post (informacion de la imagen/video, etc',
        inputSchema:{
            add_id:z.string().describe('el id del anuncio')
        }
    },
    async ({add_id})=>{
        const params : Record<string,string> = {
         fields:'id,name,title,body,image_url'
        }
        
           try{
const data = await  getApiClient().fetchData(`${add_id}/adcreatives`,params)
        const json = await data.json();
           return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)

server.registerTool(
    'atribucion_medicion_anuncio',
    {
        description:'Acciones y eventos que Meta puede atribuir a este anuncio',
        inputSchema:{
            add_id:z.string().describe('el id del anuncio')
        }
    },
    async ({add_id})=>{
        const params : Record<string,string> = {
         fields:'id,tracking_specs,conversion_domain,creative'
        }
       
           try{
 const data = await  getApiClient().fetchData(`${add_id}`,params)
        const json = await data.json();
           return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)

server.registerTool(
    'obtener_objetivo_adset',
    {
        description:'utilizar esta tool cuando se requiera saber el objetivo real de una campana, necesitas el id_adset por lo tanto pivotear hasta encontrar el id del adset',
        inputSchema:{
            adset_id:z.string()
        }
    },
    async ({adset_id})=>{
        const params:Record<string,string|any> = {
            fields:'optimization_goal,billing_event,bid_strategy,targeting,destination_type'
        }
        
        try{
const data = await  getApiClient().fetchData(`${adset_id}`,params)
        const json = await data.json();
        return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)

server.registerTool(
    'obtener_fase_aprendizaje_conjunto',
    {
        description:'obtiene el estado de aprendizaje de un ad set.',
        inputSchema:{
            addset_id:z.string().describe('el id del anuncio')
        }
    },
    async ({addset_id})=>{
        const params : Record<string,string> = {
         fields:'name,learning_stage_info,effective_status,id'
        }
        
           try{
          const data = await  getApiClient().fetchData(`${addset_id}`,params)
          const json = await data.json();
           return {content:[{type:'text',text:JSON.stringify(json)}]}
        }catch(e){
          return {content:[{type:'text',text:JSON.stringify(e)}]}
        }
    }
)
/*
server.registerTool(
  'obtener_anuncios',
  {
    description: 'Obtener anuncios (Ads) de una cuenta, campaña o conjunto específico. Parámetros: account_input, adset_id (opcional), campaign_id (opcional), limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta'),
      adset_id: z.string().default('').describe('ID de conjunto de anuncios para filtrar (opcional)'),
      campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, adset_id, campaign_id, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const params: Record<string, unknown> = {
        fields: 'id,name,status,effective_status,adset_id,campaign_id',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      let endpoint: string;
      let origen: string;
      if (adset_id.trim()) {
        endpoint = `/${adset_id.trim()}/ads`;
        origen = `conjunto '${adset_id}'`;
      } else if (campaign_id.trim()) {
        endpoint = `/${campaign_id.trim()}/ads`;
        origen = `campaña '${campaign_id}'`;
      } else {
        const accountId = await resolveAccount(account_input);
        endpoint = `/${accountId}/ads`;
        origen = `cuenta '${account_input}'`;
      }
      const data = await metaGet(endpoint, params);
      const anuncios = data.data as any[];
      if (!anuncios?.length)
        return { content: [{ type: 'text', text: `No se encontraron anuncios en ${origen}.` }] };
      const resultados = [`Anuncios en ${origen} (${anuncios.length} mostrados):\n`];
      for (const a of anuncios) {
        const estado = traducirEstado(a.effective_status ?? a.status ?? '');
        resultados.push(
          `- ${a.name ?? 'Sin nombre'} (ID: ${a.id})\n` +
          `  Estado: ${estado}\n` +
          `  Conjunto ID: ${a.adset_id ?? 'N/A'} | Campaña ID: ${a.campaign_id ?? 'N/A'}`,
        );
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar los anuncios: ${e.message}` }] };
    }
  },
);*/

 async function metaGet(endpoint: string, params: Record<string, unknown> = {}): Promise<any> {
  const qs = new URLSearchParams({ access_token: getToken() });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const resp = await fetch(`${API_BASE}${endpoint}?${qs}`);
  return resp.json();
}


 async function metaPost(endpoint: string, params: Record<string, unknown> = {}): Promise<any> {
  const qs = new URLSearchParams({ access_token: getToken() });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const resp = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body: qs });
  return resp.json();
}

 function traducirEstado(status: string): string {
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

 async function resolveAccount(accountInput: string): Promise<string> {
  const input = accountInput.trim();
  if (/^\d+$/.test(input)) return `act_${input}`;
  if (input.toLowerCase().startsWith('act_')) return input;
  try {
    const data = await metaGet('/me/adaccounts', { fields: 'id,name', limit: 200 });
    const accounts = (data.data ?? []) as Array<{ id: string; name: string }>;
    const match = accounts.find((a) =>
      a.name.toLowerCase().includes(input.toLowerCase()),
    );
    if (match) return match.id;
  } catch {}
  return `act_${input}`;
}

 function presupuestoStr(daily?: string, lifetime?: string): string {
  if (daily) return `$${(parseInt(daily) / 100).toFixed(2)}/día`;
  if (lifetime) return `$${(parseInt(lifetime) / 100).toFixed(2)} total`;
  return 'no definido';
}

function nextCursor(data: any): string | null {
  return data?.paging?.cursors?.after ?? (data?.paging?.next ? (data.paging.cursors?.after ?? null) : null);
}



// ─── CONJUNTOS DE ANUNCIOS ────────────────────────────────────────────────────

server.registerTool(
  'obtener_conjuntos',
  {
    description: 'Obtener conjuntos de anuncios (Ad Sets) de una cuenta o campaña específica. Parámetros: account_input, campaign_id (opcional), limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
      campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, campaign_id, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const params: Record<string, unknown> = {
        fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      let endpoint: string;
      let origen: string;
      if (campaign_id.trim()) {
        endpoint = `/${campaign_id.trim()}/adsets`;
        origen = `campaña '${campaign_id}'`;
      } else {
        const accountId = await resolveAccount(account_input);
        endpoint = `/${accountId}/adsets`;
        origen = `cuenta '${account_input}'`;
      }
      const data = await metaGet(endpoint, params);
      const conjuntos = data.data as any[];
      if (!conjuntos?.length)
        return { content: [{ type: 'text', text: `No se encontraron conjuntos de anuncios en ${origen}.` }] };
      const resultados = [`Conjuntos de anuncios en ${origen} (${conjuntos.length} mostrados):\n`];
      for (const cs of conjuntos) {
        const raw = presupuestoStr(cs.daily_budget, cs.lifetime_budget);
        const presupuesto = raw === 'no definido' ? 'heredado de campaña' : raw;
        const estado = traducirEstado(cs.effective_status ?? '');
        resultados.push(
          `- ${cs.name} (ID: ${cs.id})\n` +
          `  Estado: ${estado} | Presupuesto: ${presupuesto}\n` +
          `  Campaña ID: ${cs.campaign_id ?? 'N/A'}`,
        );
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar los conjuntos de anuncios: ${e.message}` }] };
    }
  },
);

// ─── ANUNCIOS ─────────────────────────────────────────────────────────────────



// ─── SEGMENTACIÓN ─────────────────────────────────────────────────────────────

server.registerTool(
  'obtener_segmentacion_conjunto',
  {
    description: 'Obtiene la segmentación completa (Targeting) de un Ad Set: geografía, demografía, intereses, comportamientos, exclusiones y públicos personalizados.',
    inputSchema: {
      adset_id: z.string().describe('ID del conjunto de anuncios (Ad Set)'),
    },
  },
  async ({ adset_id }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const conjunto = await metaGet(`/${adset_id}`, {
        fields: 'name,campaign_id,status,effective_status,targeting',
      });
      const targeting = conjunto.targeting;
      if (!targeting)
        return { content: [{ type: 'text', text: `El conjunto '${conjunto.name}' (ID: ${adset_id}) no tiene datos de segmentación definidos.` }] };

      const lineas = [
        `🎯 Segmentación Detallada del Conjunto: ${conjunto.name} (ID: ${adset_id})`,
        `   Estado: ${traducirEstado(conjunto.effective_status ?? '')}\n`,
        '📊 CONFIGURACIÓN DE AUDIENCIA:',
        '─────────────────────────────────────────────',
      ];

      lineas.push(`• 👥 Edades: ${targeting.age_min ?? 'Cualquiera'} a ${targeting.age_max ?? 'Cualquiera'} años`);
      const genders: number[] | undefined = targeting.genders;
      let generoStr = 'Todos';
      if (JSON.stringify(genders) === '[1]') generoStr = 'Hombres';
      else if (JSON.stringify(genders) === '[2]') generoStr = 'Mujeres';
      lineas.push(`• ⚥ Género: ${generoStr}`);

      const locales = targeting.locales ?? [];
      if (locales.length) {
        const idiomas = locales.map((l: any) =>
          typeof l === 'object' ? String(l.name ?? l.id ?? l) : String(l),
        );
        lineas.push(`• 🗣 Idiomas: ${idiomas.join(', ')}`);
      } else {
        lineas.push('• 🗣 Idiomas: Todos los idiomas');
      }

      const geo = targeting.geo_locations ?? {};
      lineas.push('\n📍 UBICACIONES GEOGRÁFICAS:');
      const tiposGeo: Record<string, string> = {
        countries: 'Países',
        regions: 'Regiones/Estados',
        cities: 'Ciudades',
        zips: 'Códigos Postales',
        custom_locations: 'Radios personalizados (Pines)',
      };
      let hayGeo = false;
      for (const [clave, etiqueta] of Object.entries(tiposGeo)) {
        const items = geo[clave] ?? [];
        if (items.length) {
          hayGeo = true;
          lineas.push(`  ▪ ${etiqueta}:`);
          for (const item of items) {
            if (typeof item === 'object') {
              if ('latitude' in item) {
                const nombre = `Lat ${(item.latitude as number).toFixed(4)}, Lon ${(item.longitude as number).toFixed(4)}`;
                const radio = item.radius ? ` (+${item.radius} ${item.distance_unit})` : '';
                lineas.push(`    - ${nombre}${radio}`);
              } else {
                const nombre = item.name ?? item.key ?? 'Desconocido';
                const radio = item.radius ? ` (+${item.radius} ${item.distance_unit})` : '';
                lineas.push(`    - ${nombre}${radio}`);
              }
            } else {
              lineas.push(`    - ${item}`);
            }
          }
        }
      }
      if (!hayGeo) lineas.push('  ▪ Abierta (Sin restricciones geográficas específicas)');

      const customAud = targeting.custom_audiences ?? [];
      if (customAud.length) {
        lineas.push('\n👥 PÚBLICOS PERSONALIZADOS / SIMILARES INCLUIDOS:');
        for (const aud of customAud) lineas.push(`  ▪ ${aud.name ?? 'ID: ' + aud.id}`);
      }
      const excludedCustomAud = targeting.excluded_custom_audiences ?? [];
      if (excludedCustomAud.length) {
        lineas.push('\n🚫 PÚBLICOS PERSONALIZADOS EXCLUIDOS:');
        for (const aud of excludedCustomAud) lineas.push(`  ▪ ${aud.name ?? 'ID: ' + aud.id}`);
      }

      const flexible = targeting.flexible_spec ?? [];
      if (flexible.length) {
        lineas.push('\n🎯 INCLUSIONES DE SEGMENTACIÓN DETALLADA:');
        flexible.forEach((bloque: any, idx: number) => {
          lineas.push(`  ▪ Bloque de Coincidencia #${idx + 1} (Cumplir al menos uno):`);
          for (const clave of ['interests', 'behaviors', 'demographics']) {
            const items = bloque[clave] ?? [];
            if (items.length) {
              const tipo = clave === 'interests' ? 'Intereses' : clave === 'behaviors' ? 'Comportamientos' : 'Datos Demográficos';
              lineas.push(`    🔹 ${tipo}:`);
              for (const item of items) lineas.push(`      - ${item.name} (ID: ${item.id})`);
            }
          }
        });
      }
      const exclusions = targeting.exclusions ?? {};
      if (Object.keys(exclusions).length) {
        lineas.push('\n❌ EXCLUSIONES DE SEGMENTACIÓN DETALLADA:');
        for (const clave of ['interests', 'behaviors', 'demographics']) {
          const items = exclusions[clave] ?? [];
          if (items.length) {
            const tipo = clave === 'interests' ? 'Intereses' : clave === 'behaviors' ? 'Comportamientos' : 'Datos Demográficos';
            lineas.push(`    🔹 Excluyendo ${tipo}:`);
            for (const item of items) lineas.push(`      - ${item.name} (ID: ${item.id})`);
          }
        }
      }

      lineas.push('\n📱 UBICACIONES DE ANUNCIOS (PLACEMENTS):');
      if (!targeting.publisher_platforms) {
        lineas.push('  ▪ Ubicaciones Advantage+ (Automáticas - Recomendado por Meta)');
      } else {
        lineas.push(`  ▪ Dispositivos: ${(targeting.device_platforms ?? []).join(', ')}`);
        lineas.push(`  ▪ Plataformas: ${(targeting.publisher_platforms ?? []).join(', ')}`);
        const posiciones = [
          ...(targeting.facebook_positions ?? []),
          ...(targeting.instagram_positions ?? []),
          ...(targeting.messenger_positions ?? []),
          ...(targeting.audience_network_positions ?? []),
        ];
        if (posiciones.length) lineas.push(`  ▪ Posiciones específicas: ${posiciones.join(', ')}`);
      }

      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al extraer la segmentación del Ad Set ${adset_id}: ${e.message}` }] };
    }
  },
);

// ─── GESTIÓN DE ESTADOS ───────────────────────────────────────────────────────

server.registerTool(
  'cambiar_estado_campana',
  {
    description: "Encender o apagar una campaña. Parámetros: campaign_id, accion ('encender' o 'apagar').",
    inputSchema: {
      campaign_id: z.string().describe('ID de la campaña'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ campaign_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      await metaPost(`/${campaign_id}`, { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
      const emoji = acc === 'encender' ? '🚀' : '⏸';
      return { content: [{ type: 'text', text: `${emoji} Campaña ${campaign_id} ${acc === 'encender' ? 'activada' : 'pausada'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado de la campaña: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'cambiar_estado_conjunto',
  {
    description: "Encender o apagar un conjunto de anuncios (Ad Set). Parámetros: adset_id, accion ('encender' o 'apagar').",
    inputSchema: {
      adset_id: z.string().describe('ID del conjunto de anuncios'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ adset_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      await metaPost(`/${adset_id}`, { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
      return { content: [{ type: 'text', text: `Conjunto ${adset_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado del conjunto: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'cambiar_estado_anuncio',
  {
    description: "Encender o apagar un anuncio individual. Parámetros: ad_id, accion ('encender' o 'apagar').",
    inputSchema: {
      ad_id: z.string().describe('ID del anuncio'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ ad_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      await metaPost(`/${ad_id}`, { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
      return { content: [{ type: 'text', text: `Anuncio ${ad_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado del anuncio: ${e.message}` }] };
    }
  },
);

// ─── PRESUPUESTOS ─────────────────────────────────────────────────────────────

server.registerTool(
  'modificar_presupuesto_campana',
  {
    description: "Ajusta el presupuesto de una campaña. Parámetros: campaign_id, nuevo_presupuesto (monto en moneda local, ej: 1500.00), tipo_presupuesto ('diario' o 'total').",
    inputSchema: {
      campaign_id: z.string(),
      nuevo_presupuesto: z.number().describe('Monto en moneda local, ej: 1500.00'),
      tipo_presupuesto: z.string().describe("'diario' o 'total'"),
    },
  },
  async ({ campaign_id, nuevo_presupuesto, tipo_presupuesto }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const tipo = tipo_presupuesto.trim().toLowerCase();
    if (tipo !== 'diario' && tipo !== 'total')
      return { content: [{ type: 'text', text: "Error: 'tipo_presupuesto' debe ser 'diario' o 'total'." }] };
    const campo = tipo === 'diario' ? 'daily_budget' : 'lifetime_budget';
    const centavos = Math.round(nuevo_presupuesto * 100);
    try {
      await metaPost(`/${campaign_id}`, { [campo]: centavos });
      return { content: [{ type: 'text', text: `💰 Presupuesto ${tipo} de la campaña ${campaign_id} actualizado a $${nuevo_presupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudo actualizar el presupuesto: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'modificar_presupuesto_conjunto',
  {
    description: "Ajusta el presupuesto de un Ad Set (útil en cuentas con ABO). Parámetros: adset_id, nuevo_presupuesto, tipo_presupuesto ('diario' o 'total').",
    inputSchema: {
      adset_id: z.string(),
      nuevo_presupuesto: z.number().describe('Monto en moneda local, ej: 500.00'),
      tipo_presupuesto: z.string().describe("'diario' o 'total'"),
    },
  },
  async ({ adset_id, nuevo_presupuesto, tipo_presupuesto }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const tipo = tipo_presupuesto.trim().toLowerCase();
    if (tipo !== 'diario' && tipo !== 'total')
      return { content: [{ type: 'text', text: "Error: 'tipo_presupuesto' debe ser 'diario' o 'total'." }] };
    const campo = tipo === 'diario' ? 'daily_budget' : 'lifetime_budget';
    const centavos = Math.round(nuevo_presupuesto * 100);
    try {
      await metaPost(`/${adset_id}`, { [campo]: centavos });
      return { content: [{ type: 'text', text: `💰 Presupuesto ${tipo} del conjunto ${adset_id} actualizado a $${nuevo_presupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudo actualizar el presupuesto del conjunto: ${e.message}` }] };
    }
  },
);

// ─── REPORTES DE RENDIMIENTO ──────────────────────────────────────────────────

function formatInsightRow(i: any, indent = ''): string {
  const conversiones =
    (i.actions ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? '0';
  const cpa =
    (i.cost_per_action_type ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? 'N/A';
  const roas = i.purchase_roas?.[0]?.value ?? 'N/A';
  return (
    `${indent}Campaña: ${i.campaign_name ?? 'N/A'}\n` +
    `${indent}  Impresiones : ${i.impressions ?? 0}\n` +
    `${indent}  Clics       : ${i.clicks ?? 0}\n` +
    `${indent}  CTR         : ${i.ctr ?? 0}%\n` +
    `${indent}  Gasto       : $${i.spend ?? 0}\n` +
    `${indent}  CPM         : $${i.cpm ?? 0}\n` +
    `${indent}  CPC         : $${i.cpc ?? 0}\n` +
    `${indent}  Conversiones: ${conversiones}\n` +
    `${indent}  CPA         : $${cpa}\n` +
    `${indent}  ROAS        : ${roas}\n`
  );
}

server.registerTool(
  'reporte_rendimiento',
  {
    description: 'Obtener métricas clave (KPIs) por campaña para un rango de fechas. Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
      limite: z.number().int().default(25).describe('Campañas por página'),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, fecha_inicio, fecha_fin, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = {
        fields: 'campaign_name,impressions,clicks,ctr,spend,cpm,cpc,actions,cost_per_action_type,purchase_roas,optimization_goal',
        time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
        level: 'campaign',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/insights`, params);
      const insights = data.data as any[];
      if (!insights?.length)
        return { content: [{ type: 'text', text: `No hay datos de rendimiento para el período ${fecha_inicio} → ${fecha_fin}` }] };
      const lineas = [`Reporte de rendimiento: ${fecha_inicio} → ${fecha_fin} (${insights.length} campañas)\n`];
      for (const i of insights) lineas.push(formatInsightRow(i));
      const nc = nextCursor(data);
      if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al obtener reporte de rendimiento: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'reporte_rendimiento_todas',
  {
    description: 'Obtener métricas clave (KPIs) de todas las cuentas accesibles para un rango de fechas.',
    inputSchema: {
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
      limite_por_cuenta: z.number().int().default(20),
    },
  },
  async ({ fecha_inicio, fecha_fin, limite_por_cuenta }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const cuentasData = await metaGet('/me/adaccounts', { fields: 'id,name' });
      const cuentas = cuentasData.data as Array<{ id: string; name?: string }>;
      if (!cuentas?.length)
        return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias asociadas al token.' }] };
      const lineas = [`Reporte de rendimiento: ${fecha_inicio} → ${fecha_fin}\n`];
      for (const cuenta of cuentas) {
        lineas.push(`\n== Cuenta: ${cuenta.name ?? cuenta.id} (${cuenta.id}) ==`);
        try {
          const data = await metaGet(`/${cuenta.id}/insights`, {
            fields: 'campaign_name,impressions,clicks,ctr,spend,cpm,cpc,actions,cost_per_action_type,purchase_roas',
            time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
            level: 'campaign',
            limit: limite_por_cuenta,
          });
          const insights = data.data as any[];
          if (!insights?.length) { lineas.push('  Sin datos para este período.'); continue; }
          for (const i of insights) lineas.push(formatInsightRow(i, '  '));
          if (nextCursor(data)) lineas.push('  📄 Hay más campañas en esta cuenta (usa reporte_rendimiento con pagina_cursor)');
        } catch { lineas.push('  Error al consultar esta cuenta.'); }
      }
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al obtener reporte de rendimiento: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'reporte_rendimiento_desglosado',
  {
    description: "Desglosa resultados por segmento. Parámetros: account_input, fecha_inicio, fecha_fin, desglose ('age', 'gender' o 'publisher_platform'), limite (default 30), pagina_cursor.",
    inputSchema: {
      account_input: z.string(),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
      desglose: z.string().describe("'age', 'gender' o 'publisher_platform'"),
      limite: z.number().int().default(30),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, fecha_inicio, fecha_fin, desglose, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const des = desglose.trim().toLowerCase();
    const titulos: Record<string, string> = { age: 'Edades', gender: 'Géneros', publisher_platform: 'Plataformas (FB/IG)' };
    const titulo = titulos[des] ?? des.toUpperCase();
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = {
        fields: 'campaign_name,impressions,clicks,ctr,spend',
        time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
        level: 'campaign',
        breakdowns: des,
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/insights`, params);
      const insights = data.data as any[];
      if (!insights?.length)
        return { content: [{ type: 'text', text: `No hay datos para desglosar en el período ${fecha_inicio} → ${fecha_fin}.` }] };
      const traducciones: Record<string, string> = {
        instagram: 'Instagram',
        facebook: 'Facebook',
        messenger: 'Messenger',
        audience_network: 'Sitios web aliados',
      };
      const lineas = [`Análisis de Rendimiento por ${titulo} (${fecha_inicio} → ${fecha_fin}) — ${insights.length} filas\n`];
      for (const i of insights) {
        const segmento = traducciones[i[des] ?? ''] ?? i[des] ?? 'Desconocido';
        lineas.push(
          `  ${i.campaign_name} — ${segmento}\n` +
          `    Gasto: $${parseFloat(i.spend ?? '0').toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Clics: ${i.clicks ?? 0} | CTR: ${parseFloat(i.ctr ?? '0').toFixed(2)}%\n`,
        );
      }
      const nc = nextCursor(data);
      if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudo construir el reporte desglosado: ${e.message}` }] };
    }
  },
);

// ─── CREATIVOS ────────────────────────────────────────────────────────────────

server.registerTool(
  'obtener_creativos_anuncio',
  {
    description: 'Audita los textos y contenidos de los creativos de la cuenta. Parámetros: account_input, limite (default 15), pagina_cursor.',
    inputSchema: {
      account_input: z.string(),
      limite: z.number().int().default(15),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = { fields: 'id,name,title,body', limit: limite };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/adcreatives`, params);
      const creativos = data.data as any[];
      if (!creativos?.length)
        return { content: [{ type: 'text', text: 'No se encontraron creativos registrados en esta cuenta.' }] };
      const lineas = [`Creativos de anuncios (${creativos.length} mostrados):\n`];
      for (const c of creativos) {
        lineas.push(
          `  Anuncio: ${c.name ?? 'Sin nombre'} (ID: ${c.id})\n` +
          `    Título: ${c.title ?? 'Sin título'}\n` +
          `    Texto:  ${c.body ?? 'Sin texto'}\n`,
        );
      }
      const nc = nextCursor(data);
      if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al leer los creativos: ${e.message}` }] };
    }
  },
);

// ─── MONITOREO ────────────────────────────────────────────────────────────────

server.registerTool(
  'detectar_fugas_dinero',
  {
    description: 'Simpre pregunta el rango de fecha.Analiza la cuenta en busca de campañas que gastan sin resultados: sin conversiones, CTR bajo, CPA elevado, sin entregas, si consideras que la informacion que te entrega no es suficiente, puedes utilizar la todo_tool',
    inputSchema: {
      account_input: z.string(),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
      limite: z.number().int().default(30),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, fecha_inicio, fecha_fin, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = {
        fields: 'campaign_name,campaign_id,impressions,clicks,ctr,spend,cost_per_action_type,actions,optimization_goal',
        brakdowns:'publisher_platform',
        time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
        level: 'campaign',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data3 = await getApiClient().fetchData(`/${accountId}/insights`, params);
      const data = await metaGet(`/${accountId}/insights`, params);
      return {content:[{type:'text',text:JSON.stringify(data)}]}
      const insights = data.data as any[];
      const alertas: string[] = [];
      for (const i of insights) {
        const gasto = parseFloat(i.spend ?? '0');
        const impresiones = parseInt(i.impressions ?? '0');
        const ctr = parseFloat(i.ctr ?? '0');
        const conversiones = parseInt(
          (i.actions ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? '0',
        );
        const cpaVal = parseFloat(
          (i.cost_per_action_type ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? '0',
        ) || null;
        const problemas: string[] = [];
        if (gasto > 0 && conversiones === 0)
          problemas.push(`Gasto $${gasto.toFixed(2)} sin ninguna conversión`);
        if (impresiones > 1000 && ctr < 0.5)
          problemas.push(`CTR muy bajo (${ctr.toFixed(2)}%) con ${impresiones} impresiones`);
        if (cpaVal && cpaVal > 100)
          problemas.push(`CPA elevado: $${cpaVal.toFixed(2)} por conversión`);
        if (impresiones === 0 && gasto === 0)
          problemas.push('Sin entregas ni gasto — posible error de configuración o audiencia');
        if (problemas.length)
          alertas.push(`⚠ Campaña: ${i.campaign_name}\n` + problemas.map((p) => `  - ${p}`).join('\n'));
      }
      const nc = nextCursor(data);
      const paginaInfo = nc ? `\n\n📄 Siguiente página → pagina_cursor='${nc}'` : '';
      return {content:[{type:'text','text':JSON.stringify(data)}]}
      if (!alertas.length)
        return { content: [{ type: 'text', text: `No se detectaron fugas de dinero en el período ${fecha_inicio} → ${fecha_fin}. Todo parece en orden.${paginaInfo}` }] };
      return { content: [{ type: 'text', text: `Fugas de dinero detectadas (${fecha_inicio} → ${fecha_fin}):\n\n${alertas.join('\n\n')}${paginaInfo}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al analizar fugas de dinero: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'monitorear_errores_cuenta',
  {
    description: 'Revisa campañas, conjuntos y anuncios con errores, rechazos o problemas de entrega.',
    inputSchema: {
      account_input: z.string(),
      limite: z.number().int().default(50).describe('Máximo de objetos a revisar por tipo'),
    },
  },
  async ({ account_input, limite }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const [campData, conjData, adsData] = await Promise.all([
        metaGet(`/${accountId}/campaigns`, { fields: 'id,name,status,effective_status', limit: limite }),
        metaGet(`/${accountId}/adsets`, { fields: 'id,name,status,effective_status,issues_info', limit: limite }),
        metaGet(`/${accountId}/ads`, { fields: 'id,name,status,effective_status,issues_info', limit: limite }),
      ]);
      const errores: string[] = [];
      const estadosProblema = new Set(['DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'CAMPAIGN_PAUSED']);
      for (const c of (campData.data ?? [])) {
        if (estadosProblema.has(c.effective_status))
          errores.push(`[CAMPAÑA] ${c.name} — Estado: ${c.effective_status}`);
      }
      for (const cs of (conjData.data ?? [])) {
        if (estadosProblema.has(cs.effective_status)) {
          const detalle = (cs.issues_info ?? []).map((i: any) => i.error_message).filter(Boolean).join('; ') || 'sin detalle';
          errores.push(`[CONJUNTO] ${cs.name} — Estado: ${cs.effective_status} | ${detalle}`);
        }
      }
      const adsNext = nextCursor(adsData);
      for (const a of (adsData.data ?? [])) {
        if (estadosProblema.has(a.effective_status)) {
          const detalle = (a.issues_info ?? []).map((i: any) => i.error_message).filter(Boolean).join('; ') || 'sin detalle';
          errores.push(`[ANUNCIO] ${a.name} — Estado: ${a.effective_status} | ${detalle}`);
        }
      }
      const notaPaginacion = adsNext
        ? `\n⚠ Se revisaron los primeros ${limite} objetos de cada tipo. Aumenta 'limite' si la cuenta es grande.`
        : '';
      if (!errores.length)
        return { content: [{ type: 'text', text: `No se encontraron errores activos en la cuenta '${account_input}'.${notaPaginacion}` }] };
      return { content: [{ type: 'text', text: `Errores detectados en la cuenta '${account_input}':\n\n${errores.map((e) => `⚠ ${e}`).join('\n')}${notaPaginacion}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al monitorear la cuenta: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'todo_tool',
  {
    description:'Utiliza esta tool cuando el resto de las tools no cumplan con los requerimientos que se pidan, se puede consultar directamente a la api de meta con dos argumentos, el endpoint que ira despues de v25.0 y los parametros que se le quieran pasar, esta tool es un comodin para cualquier consulta a la api de meta que no este cubierta por las otras tools, se recomienda usarla con cuidado y solo cuando sea necesario.',
    inputSchema: {
      endpoint: z.string().describe('el endpoint de la api'),
      parametros:z.record(z.string(), z.any()).describe('los parametros que se le quieran pasar a la api')
    }
  },
  async ({endpoint, parametros})=>{
    try{
    const data = await fetch(`${API_BASE}/${endpoint}?${new URLSearchParams({...parametros,access_token:getToken()})}` )
    const json = await data.json()
    return {content:[{type:'text', text:JSON.stringify(json)}]}}
    catch(e){
        return {content:[{type:'text',text:JSON.stringify(e)}]}
    }
  }
)

server.registerTool(
    'obtener_informacion_general_campana',
    {
        description:'obtiene informacion como id,nombre,effective_status, */utilizar esta tool cuando se quiera iniciar con la investigacion inicial de una camapaña, el estado actual',
        inputSchema:{
            campaign_id:z.string()
        }
    },
    async ({campaign_id})=>{
        const params: Record<string,string> = {
            fields:'id,name,effective_status'
        }
        const data = await  getApiClient().fetchData(`${campaign_id}`,params)
        const json = await data.json();
        return {content:[{type:'text',text:JSON.stringify(json)}]}
    }
)


server.registerTool(
  'obtener_campanas',
  {
    description: 'Obtener campañas de una cuenta publicitaria con estado y presupuesto. Parámetros: account_input (ID o nombre), limite (default 20), pagina_cursor (cursor de página anterior).',
    inputSchema: {
      account_input: z.string().describe('ID numérico, act_XXX o nombre de la cuenta publicitaria'),
      limite: z.number().int().default(100).describe('Campañas por página'),
      pagina_cursor: z.string().default('').describe('Cursor devuelto en respuesta anterior para ver siguiente página'),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = {
        fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,objective',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/campaigns`, params);
      const campanas = data.data as any[];
      if (!campanas?.length)
        return { content: [{ type: 'text', text: `No se encontraron campañas para la cuenta '${account_input}'.` }] };
      const resultados = [`Campañas en '${account_input}' (${campanas.length} mostradas):\n`];
      for (const c of campanas) {
        const presupuesto = presupuestoStr(c.daily_budget, c.lifetime_budget);
        const estado = traducirEstado(c.effective_status ?? c.status ?? '');
        resultados.push(
          `- ${c.name} (ID: ${c.id})\n` +
          `  Estado: ${estado} | Objetivo: ${c.objective ?? 'N/A'}\n` +
          `  Presupuesto: ${presupuesto}\n` +
          `  Inicio: ${c.start_time ?? 'N/A'} | Fin: ${c.stop_time ?? 'sin fecha fin'}`,
        );
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar la API de Meta: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'obtener_campanas_activas',
  {
    description: 'Obtener campañas ACTIVE de una cuenta publicitaria. Parámetros: account_input, limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID numérico, act_XXX o nombre de la cuenta'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = {
        fields: 'id,name,status,daily_budget,objective',
        effective_status: JSON.stringify(['ACTIVE']),
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/campaigns`, params);
      const campanas = data.data as any[];
      if (!campanas?.length)
        return { content: [{ type: 'text', text: `No hay campañas activas en la cuenta '${account_input}'.` }] };
      const resultados = [`Campañas activas (${campanas.length} mostradas):\n`];
      for (const c of campanas) {
        const pStr = c.daily_budget
          ? `$${(parseInt(c.daily_budget) / 100).toFixed(2)}/día`
          : 'presupuesto variable';
        resultados.push(`- ${c.name} (ID: ${c.id}) | Objetivo: ${c.objective ?? 'N/A'} | Inversión: ${pStr}`);
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas activas: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'obtener_todas_campanas_activas',
  {
    description: 'Obtener campañas activas de todas las cuentas accesibles. Parámetro: limite_por_cuenta (default 10).',
    inputSchema: {
      limite_por_cuenta: z.number().int().default(10).describe('Máximo de campañas a mostrar por cuenta'),
    },
  },
  async ({ limite_por_cuenta }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const cuentasData = await metaGet('/me/adaccounts', { fields: 'id,name' });
      const cuentas = cuentasData.data as Array<{ id: string; name?: string }>;
      if (!cuentas?.length)
        return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias asociadas al token.' }] };
      const resultados: string[] = [];
      let total = 0;
      for (const cuenta of cuentas) {
        try {
          const data = await metaGet(`/${cuenta.id}/campaigns`, {
            fields: 'id,name,daily_budget,objective',
            effective_status: JSON.stringify(['ACTIVE']),
            limit: limite_por_cuenta,
          });
          const campanas = data.data as any[];
          if (campanas?.length) {
            const hayMas = nextCursor(data) ? ' (y más...)' : '';
            resultados.push(`\nCuenta: ${cuenta.name ?? cuenta.id} (${cuenta.id}) — ${campanas.length} activa(s)${hayMas}:`);
            for (const c of campanas) {
              const presupuesto = c.daily_budget
                ? `$${(parseInt(c.daily_budget) / 100).toFixed(0)}/día`
                : 'no definido';
              resultados.push(`  - ${c.name} | Objetivo: ${c.objective ?? 'N/A'} | Presupuesto: ${presupuesto}`);
            }
            total += campanas.length;
          }
        } catch {}
      }
      if (!resultados.length)
        return { content: [{ type: 'text', text: 'No hay campañas activas en ninguna de las cuentas accesibles.' }] };
      return {
        content: [{
          type: 'text',
          text: `Total campañas activas (mostrando hasta ${limite_por_cuenta} por cuenta): ${total}` + resultados.join(''),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas activas: ${e.message}` }] };
    }
  },
);


server.registerTool(
  'obtener_anuncios',
  {
    description: 'Obtener anuncios (Ads) de una cuenta, campaña o conjunto específico. Parámetros: account_input, adset_id (opcional), campaign_id (opcional), limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta'),
      adset_id: z.string().default('').describe('ID de conjunto de anuncios para filtrar (opcional)'),
      campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, adset_id, campaign_id, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const params: Record<string, unknown> = {
        fields: 'id,name,status,effective_status,adset_id,campaign_id',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      let endpoint: string;
      let origen: string;
      if (adset_id.trim()) {
        endpoint = `/${adset_id.trim()}/ads`;
        origen = `conjunto '${adset_id}'`;
      } else if (campaign_id.trim()) {
        endpoint = `/${campaign_id.trim()}/ads`;
        origen = `campaña '${campaign_id}'`;
      } else {
        const accountId = await resolveAccount(account_input);
        endpoint = `/${accountId}/ads`;
        origen = `cuenta '${account_input}'`;
      }
      const data = await metaGet(endpoint, params);
      const anuncios = data.data as any[];
      if (!anuncios?.length)
        return { content: [{ type: 'text', text: `No se encontraron anuncios en ${origen}.` }] };
      const resultados = [`Anuncios en ${origen} (${anuncios.length} mostrados):\n`];
      for (const a of anuncios) {
        const estado = traducirEstado(a.effective_status ?? a.status ?? '');
        resultados.push(
          `- ${a.name ?? 'Sin nombre'} (ID: ${a.id})\n` +
          `  Estado: ${estado}\n` +
          `  Conjunto ID: ${a.adset_id ?? 'N/A'} | Campaña ID: ${a.campaign_id ?? 'N/A'}`,
        );
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar los anuncios: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'listar_cuentas_publicitarias',
  { description: 'Listar todas las cuentas de anuncios disponibles con sus nombres e IDs, buscar hasta encontrar la que se solicite, utilizar la paginacion para seguir navegando.' },
  async () => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try{
        const data = await getApiClient().fetchData('/me/adaccounts', { fields: 'id,name',limit:200 });
      const json = await data.json();
    return { content: [{ type: 'text', text: JSON.stringify(json) }] };  
      }catch(e:any){
        return {content:[{type:'text',text:JSON.stringify(e.message)}]}
      }
  }
);  
}

