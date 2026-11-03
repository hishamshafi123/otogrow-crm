const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');

const quote = (value) => `"${value.replaceAll('"', '""')}"`;

async function snapshot() {
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('REPEATABLE READ');
  try {
    await runner.query('SET TRANSACTION READ ONLY');
    const tables = await runner.query(
      `SELECT n.nspname AS schema,c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
       AND n.nspname <> 'information_schema' ORDER BY 1,2 LIMIT 2001`,
    );
    assert(tables.length <= 2000, 'Refuse an incomplete table inventory.');
    const data = [];
    for (const table of tables) {
      const hash = createHash('sha256');
      let count = 0;
      await runner.query(
        `DECLARE preview_rows NO SCROLL CURSOR FOR SELECT md5(row_to_json(row)::text) AS hash FROM ${quote(table.schema)}.${quote(table.name)} row ORDER BY md5(row_to_json(row)::text) COLLATE "C"`,
      );
      for (;;) {
        const rows = await runner.query('FETCH FORWARD 1000 FROM preview_rows');
        for (const row of rows) hash.update(row.hash + '\n');
        count += rows.length;
        if (rows.length < 1000) break;
      }
      await runner.query('CLOSE preview_rows');
      data.push({ ...table, count, hash: hash.digest('hex') });
    }
    const columns = await runner.query(
      `SELECT table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_schema,udt_name
       FROM information_schema.columns WHERE table_schema NOT LIKE 'pg_%'
       AND table_schema <> 'information_schema' ORDER BY 1,2,4`,
    );
    const constraints = await runner.query(
      `SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid,true) AS definition
       FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1,2,3`,
    );
    const indexes = await runner.query(
      `SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
       WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema' ORDER BY 1,2,3`,
    );
    return { data, columns, constraints, indexes };
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

async function main() {
  await connectionSource.initialize();
  try {
    const before = await snapshot();
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['-r', 'dotenv/config', 'dist/command/command.js', 'upgrade', '--dry-run'],
        { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      const collect = (chunk) => {
        output += chunk.toString();
        if (output.length > 8 * 1024 * 1024) {
          child.kill('SIGTERM');
          reject(new Error('Upgrade preview exceeded the bounded log limit.'));
        }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output.slice(-8000));
    assert.match(result.output, /Upgrade plan:.*no changes made/);
    assert.doesNotMatch(result.output, /event=(?:step\.started|workspace\.started)|executed successfully/);
    assert.deepEqual(await snapshot(), before, 'Preview changed database rows or schema.');
    console.log(JSON.stringify({
      result: 'PASS',
      actualCliPreview: true,
      protectedTables: before.data.length,
      unchangedSchemaAndRows: true,
      noCommandExecution: true,
    }));
  } finally {
    await connectionSource.destroy();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
