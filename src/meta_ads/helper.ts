
/* imports owo*/
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';


/*get the meta ad token 0.o*/
export function getToken(): string {
  return process.env.META_ACCESS_TOKEN ?? '';
}

/*check if token is ok >.<*/
export function credencialesOk(): boolean {
  return getToken().length > 0;
}

/*find the path to then dot env file Unu*/
export function findEnvPath(): string {
  if ((process as any).pkg !== undefined) {
    return path.join(path.dirname(process.execPath), '.env');
  }
  const candidates = [
    path.dirname(path.resolve(process.argv[1] ?? '')),
    __dirname,
    path.resolve(__dirname, '..', '..'),
    process.cwd(),
  ];
  for (const dir of candidates) {
    try {
      const p = path.join(dir, '.env');
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return path.join(candidates[0] ?? process.cwd(), '.env');
}
export function errorCredenciales(): string {
  return ' Error: No se encontraron las credenciales de Meta Ads en el archivo de configuración (.env).';
}


/* setting the path in the environment config u.u*/
dotenv.config({ path: findEnvPath() });


