'use strict';

/**
 * Post-deployment live smoke check — SAFE no-op until deployment exists.
 *
 * Reads ONLY: GET <LIVE_API_URL>/health (public) and GET <LIVE_API_URL>/tickets
 * without a token (must be 401). Creates NOTHING: no tickets, users, objects.
 * No credentials needed and none are printed.
 *
 * Usage (after Stages 2-6, with explicit approval for the live check):
 *   LIVE_API_URL=https://<api-id>.execute-api.ap-southeast-2.amazonaws.com npm run verify:live
 * Without LIVE_API_URL it prints SKIP and exits 0.
 */

const base = (process.env.LIVE_API_URL || '').replace(/\/$/, '');

async function main() {
  if (!base) {
    console.log('SKIP  LIVE_API_URL not set — nothing deployed to check yet.');
    return;
  }
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !extra ? '' : ` — ${extra}`}`);
    if (!cond) failures += 1;
  };

  try {
    const health = await fetch(`${base}/health`);
    check('public /health responds', health.status === 404 || health.status === 200,
      `HTTP ${health.status} (404 = health correctly omitted from the API; 200 = exposed)`);
  } catch (err) {
    check('public /health responds', false, err.message);
  }

  try {
    const anon = await fetch(`${base}/tickets`);
    check('GET /tickets without token is 401', anon.status === 401, `HTTP ${anon.status}`);
  } catch (err) {
    check('GET /tickets without token is 401', false, err.message);
  }

  console.log(failures === 0 ? 'LIVE SMOKE OK' : `LIVE SMOKE FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
