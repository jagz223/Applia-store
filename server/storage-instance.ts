/**
 * Instancia activa de almacenamiento (GenFeb).
 * Archivo mínimo para que el bundler resuelva setGenFebStorage sin errores.
 */
import type { IStorage } from "./storage-genfeb";
import { InMemoryStorage } from "./storage-genfeb";

let _storage: IStorage = new InMemoryStorage();

export function setGenFebStorage(s: IStorage): void {
  _storage = s;
}

export const genFebStorage: IStorage = new Proxy({} as IStorage, {
  get(_, prop: string) {
    return (_storage as Record<string, unknown>)[prop];
  },
});

export const storage = genFebStorage;
