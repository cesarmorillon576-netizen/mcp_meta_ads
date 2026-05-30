
export const ACCIONES = {
  // Mensajería / conversaciones
  CONVERSACION_INICIADA: 'onsite_conversion.messaging_conversation_started_7d',
  CONTACTO_MENSAJERIA: 'onsite_conversion.total_messaging_connection',
  PRIMER_RESPUESTA: 'onsite_conversion.messaging_first_reply',
  CONVERSACION_RESPONDIDA: 'onsite_conversion.messaging_conversation_replied_7d',
  PROFUNDIDAD_2: 'onsite_conversion.messaging_user_depth_2_message_send',
  PROFUNDIDAD_3: 'onsite_conversion.messaging_user_depth_3_message_send',
  PROFUNDIDAD_5: 'onsite_conversion.messaging_user_depth_5_message_send',
  MENSAJE_BIENVENIDA: 'onsite_conversion.messaging_welcome_message_view',
  BLOQUEO_MENSAJERIA: 'onsite_conversion.messaging_block',
  // Leads
  LEAD: 'lead',
  // Tráfico
  VISITA_PAGINA: 'landing_page_view',
  LINK_CLICK: 'link_click',
  // Interacción
  POST_ENGAGEMENT: 'post_engagement',
  REACCION: 'post_reaction',
  COMENTARIO: 'comment',
  COMPARTIDO: 'post',
  VIDEO_VIEW: 'video_view',
  LLAMADA_20S: 'click_to_call_native_20s_call_connect',
} as const;

// Candidatos 
export const ACCIONES_COMPRA = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
export const ACCIONES_CHECKOUT = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'];
export const ACCIONES_CARRITO = ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'];
export const ACCIONES_LLAMADA = ['call_confirm_grouped', 'click_to_call_call_confirm', 'onsite_conversion.click_to_call_call_confirm'];
export const ACCIONES_GUARDADO = ['onsite_conversion.post_save', 'post_save'];
export const ACCIONES_ME_GUSTA_PAGINA = ['like', 'onsite_conversion.page_like'];


export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  campaign_name?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  ctr?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  purchase_roas?: Array<{ value: string }>;
  adset_id?: string;
  ad_id?: string;
  ad_name?: string;
  publisher_platform?: string;
  age?: string;
  gender?: string;
}

export interface JerarquiaConversion {
  keywords: string[];
  label: string;
}

export interface ResultadoPrincipal {
  label: string;
  value: string;
  type: string;
}

export interface IssueInfo {
  level?: string;
  error_code?: number;
  error_summary?: string;
  error_message?: string;
  error_type?: string;
}

export interface Creative {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  call_to_action_type?: string;
  object_type?: string;
  thumbnail_url?: string;
  instagram_permalink_url?: string;
}

export interface GeoItem {
  name?: string;
  key?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  distance_unit?: string;
}


export interface CampaignData {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  stop_time?: string;
  bid_strategy?: string;
  issues_info?: IssueInfo[];
}

export interface AdSetData {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  destination_type?: string;
  billing_event?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  campaign_id?: string;
  targeting?: Targeting;
  issues_info?: IssueInfo[];
  promoted_object?: Record<string, unknown>;
}

export interface AdData {
  id?: string;
  name?: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
  issues_info?: IssueInfo[];
  creative?: Creative;
}

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  locales?: Array<string | { name?: string; id?: string }>;
  geo_locations?: {
    countries?: string[];
    regions?: GeoItem[];
    cities?: GeoItem[];
    zips?: GeoItem[];
    places?: GeoItem[];
    custom_locations?: GeoItem[];
    location_types?: string[];
  };
  custom_audiences?: Array<{ id?: string; name?: string }>;
  excluded_custom_audiences?: Array<{ id?: string; name?: string }>;
  flexible_spec?: Array<Record<string, Array<{ id?: string; name?: string }>>>;
  exclusions?: Record<string, Array<{ id?: string; name?: string }>>;
  publisher_platforms?: string[];
  device_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
  targeting_automation?: { advantage_audience?: number; individual_setting?: Record<string, number> };
  user_age_unknown?: boolean | number;
  brand_safety_content_filter_levels?: string[];
}
