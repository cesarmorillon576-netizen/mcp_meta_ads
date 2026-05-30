import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import{
    credencialesOk,
    errorCredenciales,
    initApi,
    cursorToArray
} from '../helpers.js';
import { ACCIONES } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { Campaign } = bizSdk;

export function registrarHerramientasReportes(server: McpServer) {
  server.registerTool(
    'obtener_reporte_mensajeria',
    {
      description: 'Obtiene el reporte de rendimiento (Insights) de una campaña: gasto, alcance, impresiones, y desglose específico de conversaciones e interacciones con sus costos.',
      inputSchema: {
        campaign_id: z.string().describe('ID de la campaña'),
        rango_fechas: z.enum(['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'maximum'])
          .default('last_30d')
          .describe('Rango de tiempo para evaluar el rendimiento'),
      },
    },
    async ({ campaign_id, rango_fechas }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const camp = new Campaign(campaign_id);
        
        const cursor = await camp.getInsights(
          ['campaign_id', 'campaign_name', 'spend', 'reach', 'impressions', 'actions', 'cost_per_action_type'],
          { date_preset: rango_fechas }
        );

        const insights = cursorToArray(cursor);
        if (!insights?.length) {
          return { content: [{ type: 'text', text: `No hay datos de rendimiento (Insights) para la campaña ${campaign_id} en el periodo '${rango_fechas}'. Puede que sea nueva o no tenga gasto reportado aún.` }] };
        }

        const data = insights[0] as any; 
        
        const actions = data.actions || [];
        const costs = data.cost_per_action_type || [];

        const getActionVal = (typeStr: string) => {
          const match = actions.find((a: any) => a.action_type === typeStr)
            ?? actions.find((a: any) => a.action_type.includes(typeStr));
          return match ? match.value : '0';
        };
        const getCostVal = (typeStr: string) => {
          const match = costs.find((c: any) => c.action_type === typeStr)
            ?? costs.find((c: any) => c.action_type.includes(typeStr));
          return match ? `$${parseFloat(match.value).toFixed(2)}` : 'N/A';
        };

        const conversaciones = getActionVal(ACCIONES.CONVERSACION_INICIADA);
        const costoConversacion = getCostVal(ACCIONES.CONVERSACION_INICIADA);

        const contactosMensajeria = getActionVal(ACCIONES.CONTACTO_MENSAJERIA);
        const primerRespuesta = getActionVal(ACCIONES.PRIMER_RESPUESTA);

        const profundidad2 = getActionVal(ACCIONES.PROFUNDIDAD_2);
        const profundidad3 = getActionVal(ACCIONES.PROFUNDIDAD_3);
        const profundidad5 = getActionVal(ACCIONES.PROFUNDIDAD_5);

        const interacciones = getActionVal(ACCIONES.POST_ENGAGEMENT);
        const costoInteraccion = getCostVal(ACCIONES.POST_ENGAGEMENT);

        const clicsEnlace = getActionVal(ACCIONES.LINK_CLICK);

        const lineas = [
          ` REPORTE DE RENDIMIENTO: ${data.campaign_name}`,
          ` Periodo evaluado: ${rango_fechas}`,
          `─────────────────────────────────────────────`,
          ` Importe Gastado: $${parseFloat(data.spend ?? '0').toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          ` Impresiones: ${parseInt(data.impressions ?? '0', 10).toLocaleString('es-MX')}`,
          ` Alcance (Reach): ${parseInt(data.reach ?? '0', 10).toLocaleString('es-MX')}`,
          `─────────────────────────────────────────────`,
          ` RESULTADOS PRINCIPALES (MENSAJERÍA):`,
          `   • Conversaciones Iniciadas: ${conversaciones}`,
          `   • Costo por Conversación (CPA): ${costoConversacion}`,
          `   • Contactos de mensajería (total): ${contactosMensajeria}`,
          `   • Primer respuesta del negocio: ${primerRespuesta}`,
          `─────────────────────────────────────────────`,
          ` PROFUNDIDAD DE LA CONVERSACIÓN (avance del chat):`,
          `   • Llegaron a 2 mensajes: ${profundidad2}`,
          `   • Llegaron a 3 mensajes: ${profundidad3}`,
          `   • Llegaron a 5 mensajes: ${profundidad5}`,
          `─────────────────────────────────────────────`,
          ` OTRAS MÉTRICAS DE INTERACCIÓN:`,
          `   • Interacciones totales (Engagement): ${interacciones}`,
          `   • Costo por Interacción: ${costoInteraccion}`,
          `   • Clics en el enlace: ${clicsEnlace}`,
        ];

        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar Insights de la campaña: ${e.message}` }] };
      }
    }
  );
}