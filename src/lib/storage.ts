/**
 * lib/storage.ts — API compatible con AsyncStorage sobre localStorage.
 *
 * Pos-desktop no usa react-native; este shim mantiene la misma interfaz
 * (getItem/setItem/removeItem, promesas) para que stores y api portados
 * de pos-mobil funcionen sin cambios.
 */

const namespace = (key: string) => `pos-desktop:${key}`;

export default {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(namespace(key));
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(namespace(key), value);
    } catch {
      /* storage lleno o no disponible: la app sigue funcionando en memoria */
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(namespace(key));
    } catch {
      /* ignore */
    }
  },
  async multiRemove(keys: string[]): Promise<void> {
    try {
      keys.forEach(k => localStorage.removeItem(namespace(k)));
    } catch {
      /* ignore */
    }
  },
};