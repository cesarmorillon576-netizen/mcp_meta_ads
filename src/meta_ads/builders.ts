import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getToken } from './helper';

export const API_BASE = 'https://graph.facebook.com/v25.0';

const server = new McpServer({ name: 'MetaAds', version: '2.0.0' });


export const getServer = ():McpServer => server;


class api {
    private Api_Base:string = 'https://graph.facebook.com/v25.0/';
    constructor(){}


    fetchData(endpoint:string,queryparams:any):Promise<Response>{
        return fetch(`${this.Api_Base}${endpoint}?${new URLSearchParams({...queryparams,access_token: getToken()})}`);
    }
    
}

const apiClient = new api();

export const getApiClient = (): api => apiClient;