// Quick check that the server and MySQL work together, through the same API the app will use.
// Run with the dev server up (`npm run dev`) and the demo data loaded (`npx prisma db seed`):
//   npm run smoke:api            (or: npm run smoke:api -- http://localhost:5173)
// It only signs in and out and reads data: nothing else in the database is changed.

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const PASSWORD = 'Apeejay@123';
let failures = 0;

/** One browser: keeps its session cookie between calls. */
function browser() {
  let cookie = '';
  return async function call(name, ...args) {
    const res = await fetch(`${base}/api/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ args }),
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('cp_session='));
    if (set) cookie = set.split(';')[0];
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ...body };
  };
}

function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

async function main() {
  const health = await fetch(`${base}/api/rpc/platform.health`, { method: 'POST', body: '{"args":[]}' }).catch((e) => ({ ok: false, error: e }));
  if (!health.ok) {
    console.log(`Cannot reach ${base}. Start the app with \`npm run dev\` (and MySQL with \`npm run db:up\`) first.`);
    process.exit(1);
  }
  const h = await health.json();
  check('Server reaches MySQL', h.result?.database === 'up', h.error);

  const anon = browser();
  check('Signed out: no current user', (await anon('auth.currentUser')).result === null);
  const refused = await anon('config.lookups');
  check('Signed out: data is refused', refused.status === 401, refused.error);
  const wrong = await anon('auth.signIn', 'kavya.iyer', 'not-the-password');
  check('Wrong password is refused', wrong.status === 401 && wrong.error === 'Incorrect username or password.', wrong.error);

  for (const [username, role] of [
    ['kavya.iyer', 'bd_exec'],
    ['priya.sharma', 'legal'],
    ['arjun.mehta', 'admin'],
  ]) {
    const call = browser();
    const signIn = await call('auth.signIn', username, PASSWORD);
    check(`${username}: signs in`, signIn.status === 200 && signIn.result?.roles?.includes(role), signIn.error ?? signIn.result?.name);
    if (signIn.status !== 200) continue;
    const me = await call('auth.currentUser');
    check(`${username}: session cookie identifies them`, me.result?.id === signIn.result.id);
    const lookups = await call('config.lookups');
    check(`${username}: reads reference data`, lookups.result?.institutions?.length > 0, `${lookups.result?.institutions?.length ?? 0} institutions`);
    const settings = await call('config.settings');
    const isAdmin = role === 'admin';
    check(`${username}: ${isAdmin ? 'can' : 'cannot'} open Admin settings`, isAdmin ? settings.status === 200 : settings.status === 403, settings.error);
    const cards = await call('config.rateCards', 'inst-asu');
    check(`${username}: rate cards ${role === 'bd_exec' ? 'refused' : 'listed'}`, role === 'bd_exec' ? cards.status === 403 : cards.result?.length > 0, cards.error ?? `${cards.result?.length} versions`);
    await call('auth.signOut');
    check(`${username}: signs out`, (await call('auth.currentUser')).result === null);
  }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
