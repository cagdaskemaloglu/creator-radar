import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgresConfig } from '../lib/storage/postgres';
test('PostgreSQL requires explicit configuration and verified remote TLS', () => {
  assert.throws(() => postgresConfig({}), /DATABASE_URL/);
  assert.throws(() => postgresConfig({ DATABASE_URL: 'https://example.com' }), /PostgreSQL URL/);
  assert.throws(() => postgresConfig({ DATABASE_URL: 'postgres://a:b@db.example.com/test', DATABASE_SSL: 'disable' }), /TLS/);
  assert.throws(() => postgresConfig({ DATABASE_URL: 'postgres://a:b@db.example.com/test?sslmode=require' }), /SSL query/);
  const local = postgresConfig({ DATABASE_URL: 'postgres://a:b@127.0.0.1/test' });
  assert.equal(local.ssl, false);
  const remote = postgresConfig({ DATABASE_URL: 'postgres://a:b@db.example.com/test' });
  assert.equal(typeof remote.ssl === 'object' && remote.ssl.rejectUnauthorized, true);
});
