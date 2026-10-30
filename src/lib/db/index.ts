import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

/** Opens a SQLite database and applies the committed migrations. The file is rebuilt every build. */
export function createDb(path = ':memory:') {
	const db = drizzle(new Database(path, { create: true }), { schema });
	migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
	return db;
}
