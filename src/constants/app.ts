/**
 * constants/app.ts — Constantes globales de la aplicación POS.
 *
 * Portado verbatim desde pos-mobil.
 */

export const API_PORT = 3000;
export const UDP_DISCOVERY_PORT = 5000;
export const UDP_DISCOVERY_MESSAGE = 'POS_DISCOVER';

export const HTTP_TIMEOUT_MS = 15000;
export const SERVER_RETRY_MS = 5000;
export const LICENSE_GRACE_DAYS = 3;

export const FAILED_CONNECTIONS_TO_REACTIVATE_UDP = 3;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_LIMIT = 20;

/* ── Catálogo de productos (RF-CA-006) ──────────────────────────────
 * El server recorta `limit` a 1000. El catálogo se trae PAGINADO y se
 * acumula: browse = bloques de 200, búsqueda = bloques de 20.
 * CATALOG_MAX_AUTO_ITEMS es el tope de carga automática (después aparece
 * el botón "Cargar más"). */
export const CATALOG_PAGE_SIZE = 200;
export const CATALOG_MAX_AUTO_ITEMS = 1000;

export const PRINT_POLLING_MS = 2000;
export const SCALE_HEARTBEAT_MS = 500;

export const QOS_EXPIRY_MS = 5 * 60 * 1000;

export const STORAGE_SERVER_IP = 'pos.server_ip';
export const STORAGE_SERVER_PORT = 'pos.server_port';
export const STORAGE_LICENSE_EXPIRY = 'pos.license_expiry';
export const STORAGE_TENANT = 'pos.tenant';
export const STORAGE_LICENSE = 'pos.license';

export const QR_SCHEME = 'pos://connect';