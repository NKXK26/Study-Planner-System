// Run on the trusted publishing host with a private copy of the SQLite file.
import {createRequire} from 'node:module';
import {checkedSnapshot,seriesOf} from './model.mjs';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const [mode,file,destination] = process.argv.slice(2);
if (mode === 'prepare') {
  if (!(await stat(file)).isFile()) throw Error('SQLite source file required');
  const {readLocalCatalogue} = await import('../src/app/libs/readLocalCatalogue.mjs');
  const {preparePublication} = await import('../src/app/libs/publicationDraft.mjs');
  const {PrismaClient: Local} = createRequire(new URL('../package.json', import.meta.url))('@prisma/client');
  const db = new Local({datasources:{db:{url:'file:'+resolve(file).replaceAll('\\','/')}}});
  try {
    const planners = await readLocalCatalogue(db);
    const snapshots = planners.map(preparePublication);
    await writeFile(destination,JSON.stringify(snapshots,null,2),{flag:'wx',mode:0o600});
    console.log('Wrote',snapshots.length,'definitions for review. Confirm course and intake before importing.');
  } finally {await db.$disconnect();}
} else if (mode === 'apply') {
  const snapshots = JSON.parse(await readFile(file,'utf8')).map(checkedSnapshot);
  const {createCatalogueClient} = await import('./database.mjs');
  const central = createCatalogueClient(process.env.CATALOGUE_DATABASE_URL);
  try {
    await central.$transaction(async tx=>{
      // Back up every catalogue table from the same consistent snapshot as the import.
      const revisions = await tx.revision.findMany({orderBy:{version:'asc'}});
      const events = await tx.publicationEvent.findMany();
      await writeFile(destination,JSON.stringify({revisions,events}),{flag:'wx',mode:0o600});
      const seen = new Map(revisions.map(r=>[r.series,r.snapshot]));
      for (const snapshot of snapshots) {
        const series = seriesOf(snapshot);
        if (seen.has(series)) {
          console.log(isDeepStrictEqual(seen.get(series),snapshot)?'Duplicate skipped':'Conflict skipped',snapshot.name);
          continue;
        }
        await tx.revision.create({data:{series,version:1,snapshot,events:{create:{action:'import draft',actor:'database operator'}}}});
        seen.set(series,snapshot);
      }
    },{isolationLevel:'Serializable',timeout:60000});
    console.log('Import committed. Review drafts before publication.');
  } catch {
    // PostgreSQL driver errors can include connection details.
    console.error('Catalogue import failed. Check database access, migration status and the backup destination.');
    process.exitCode = 1;
  } finally {await central.$disconnect();}
} else throw Error('Expected prepare <sqlite-copy> <new-review.json> or apply <review.json> <new-backup.json>');
