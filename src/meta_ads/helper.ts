let _token: string = '';

export function setToken(token: string): void {
  _token = token;
}

export function getToken(): string {
  return _token;
}

export function credencialesOk(): boolean {
  console.log('Verificando credenciales de Meta Ads');
  return _token?.length > 0;
}

export function errorCredenciales(): string {
  return 'Error: No se encontraron las credenciales de Meta Ads.';
}