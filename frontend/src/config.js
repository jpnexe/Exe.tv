/**
 * Configuración centralizada de conexión al Backend de Exe.tv.
 *
 * - En Producción Híbrida (Vercel / Cloudflare Pages):
 *   Define la variable de entorno VITE_API_URL (ej. https://tu-backend-exetv.onrender.com)
 * - En Red Local Wi-Fi o Desarrollo Local (puerto 5173):
 *   Conecta automáticamente al puerto 8085 del mismo host (127.0.0.1 o 192.168.x.x)
 * - En Servidor Unificado:
 *   Usa rutas relativas (/api/...)
 */
function resolveApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Si se está ejecutando en Vite Dev Server (5173) en PC o Red Local Wi-Fi
    if (port === '5173' || port === '4173') {
      return `${protocol}//${hostname}:8085`;
    }
  }

  return '';
}

export const API_BASE_URL = resolveApiBaseUrl();

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

