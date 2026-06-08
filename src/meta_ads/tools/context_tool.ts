import { getApiClient, getServer } from "../builders";
import { getToken } from "../helper";
import {API_BASE} from "../builders";
import { credencialesOk } from "../helper";
import {errorCredenciales} from "../helper";
import { z } from 'zod';
import { json } from "stream/consumers";
/*lacks of after cursor*/
