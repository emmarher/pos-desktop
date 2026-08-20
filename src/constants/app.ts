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

export const PRINT_POLLING_MS = 2000;
export const SCALE_HEARTBEAT_MS = 500;

export const QOS_EXPIRY_MS = 5 * 60 * 1000;

export const STORAGE_SERVER_IP = 'pos.server_ip';
export const STORAGE_SERVER_PORT = 'pos.server_port';
export const STORAGE_LICENSE_EXPIRY = 'pos.license_expiry';

export const QR_SCHEME = 'pos://connect';