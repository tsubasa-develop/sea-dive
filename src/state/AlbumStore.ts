// 撮影した写真の保存(IndexedDB)。localStorageでは容量が足りないためIDBを使う。
const DB_NAME = 'sea-dive-album';
const STORE = 'photos';
const MAX_PHOTOS = 60;

export interface PhotoRecord {
  id: string;
  dataUrl: string;
  at: number;
  score: number;
  rank: string;
  subject: string;       // 主役の種名
  speciesIds: string[];
  depth: number;
}

export class AlbumStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore | null {
    if (!this.db) return null;
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  async add(photo: PhotoRecord): Promise<void> {
    const store = this.tx('readwrite');
    if (!store) return;
    await requestDone(store.put(photo));
    // 上限を超えたら古いものから消す
    const all = await this.all();
    if (all.length > MAX_PHOTOS) {
      const excess = all.slice(MAX_PHOTOS);
      const st2 = this.tx('readwrite');
      if (st2) for (const p of excess) st2.delete(p.id);
    }
  }

  async all(): Promise<PhotoRecord[]> {
    const store = this.tx('readonly');
    if (!store) return [];
    const rows = await requestDone(store.getAll()) as PhotoRecord[];
    return rows.sort((a, b) => b.at - a.at);
  }

  async get(id: string): Promise<PhotoRecord | undefined> {
    const store = this.tx('readonly');
    if (!store) return undefined;
    return await requestDone(store.get(id)) as PhotoRecord | undefined;
  }

  async remove(id: string): Promise<void> {
    const store = this.tx('readwrite');
    if (!store) return;
    await requestDone(store.delete(id));
  }
}

function requestDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
