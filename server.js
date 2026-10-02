import http from 'node:http';
import {createReadStream, existsSync, statSync, readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {randomBytes, randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {botInput} from './bot.js';
import {weaponDirection,acquireLock} from './targeting.js';
import {SHIPS as specs,SPAWN_DISTANCE,LOAD_MS,COUNTDOWN_MS} from './public/rules.js';
import {orbitalWinner,beginLanding,acceptSurfaceInput,surfaceSnapshot,stepSurface} from './surface.js';

const root = path.dirname(fileURLToPath(import.meta.url));
// `npm run build` writes a bundled copy to dist/. Production serves it; `npm run dev` serves public/ directly.
const useDist = process.env.SERVE_DIST === '1' || (process.env.NODE_ENV === 'production' && existsSync(path.join(root, 'dist/index.html')));
const webRoot = path.join(root, useDist ? 'dist' : 'public');
const three = path.join(root, 'node_modules/three');

// ------------------------------------------------------------------ static files
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webp': 'image/webp',
};
const compressible = new Set(['.html', '.js', '.css', '.json', '.svg']);
const gzCache = new Map();

function resolvePublic(p) {
  if (p === '/') p = '/index.html';
  let base = webRoot, rel = p;
  if (!useDist) {
    if (p === '/three.js') return path.join(three, 'build/three.module.js');
    if (p === '/three.core.js') return path.join(three, 'build/three.core.js');
    if (p.startsWith('/addons/')) { base = path.join(three, 'examples/jsm'); rel = p.slice(7); }
  }
  const file = path.normalize(path.join(base, rel));
  return file.startsWith(base + path.sep) ? file : null;
}

function serve(req, res) {
  const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = resolvePublic(p);
  let st;
  try { st = file && statSync(file); } catch { st = null; }
  if (!st || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(file).toLowerCase();
  const headers = {
    'Content-Type': mime[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': useDist || /\.(jpg|png|mp3|mp4|webp)$/.test(ext) ? 'public, max-age=3600' : 'no-cache',
  };
  const gzip = compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gzip) {
    let entry = gzCache.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      entry = {mtime: st.mtimeMs, body: gzipSync(readFileSync(file), {level: 6})};
      gzCache.set(file, entry);
    }
    res.writeHead(200, {...headers, 'Content-Encoding': 'gzip', 'Content-Length': entry.body.length, Vary: 'Accept-Encoding'});
    return res.end(entry.body);
  }
  // Range support so the menu video can seek on iOS/Safari.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (ext === '.mp4' || ext === '.mp3')) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    res.writeHead(206, {...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1});
    return createReadStream(file, {start, end}).pipe(res);
  }
  res.writeHead(200, {...headers, 'Accept-Ranges': 'bytes', 'Content-Length': st.size});
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  try { serve(req, res); } catch { res.writeHead(500); res.end('Unable to load application'); }
});

// ------------------------------------------------------------------ game state
const wss = new WebSocketServer({server, maxPayload: 2048});
const rooms = new Map();
const MISSILE = {speed: 450, cooldown: 6000, ttl: 8, steer: .2, radius: 32, damage: 65, fuse: 16};
const ZONE_RADIUS = 145;
const SLOTS = [[0, 0], [-50, 18], [50, 18], [0, -40], [-100, 0], [100, 0], [-50, -30], [50, -30]];
const CALLSIGNS = ['HALLEY', 'VEGA', 'NOVA', 'PULSAR', 'COMET', 'ZENITH', 'QUASAR', 'AURORA', 'NEBULA', 'ECLIPSE', 'ATLAS', 'HELIOS', 'SIRIUS', 'LYRA', 'CYGNUS', 'DRACO'];
const send = (ws, m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
const r1 = v => Math.round(v * 10) / 10;
const r3 = v => Math.round(v * 1000) / 1000;

function spawn(p) {
  const [dz, dy] = SLOTS[(p.slot || 0) % SLOTS.length];
  const distance=SPAWN_DISTANCE/2;
  p.pos = p.practice ? [0, 0, p.team === 0 ? distance : -distance] : [p.team === 0 ? -distance : distance, dy, 160 + dz];
  p.yaw = p.practice ? (p.team === 0 ? 0 : Math.PI) : (p.team === 0 ? Math.PI / 2 : -Math.PI / 2);
  p.pitch = 0;
  p.hp = specs[p.ship].hp;
  p.input = {};p.lockId=null;p.lockProgress=0;p.speed=0;p.bst=false;p.thr=0;p.signedSpeed=0;p.velocity=[0,0,0];p.yawRate=p.pitchRate=0;
  p.dead = 0;
  p.lastShot = Date.now();
  p.lastMissile = Date.now() - MISSILE.cooldown + 2500;
  p.spawnedAt = Date.now();
}

function startMatch(r) {
  r.surface=null;r.landingTeam=null;r.landingEndsAt=null;
  r.phase = 'loading';
  r.launchId=randomUUID();r.loadEndsAt=Date.now()+LOAD_MS;r.startsAt=r.loadEndsAt+COUNTDOWN_MS;
  r.startedAt=r.startsAt;
  r.remaining = 300;
  r.score = [0, 0];
  r.winner = null;
  r.shots = [];
  r.missiles = [];
  r.booms = [];
  r.feed = [];
  const slot = [0, 0];
  for (const p of r.players.values()) { p.slot = slot[p.team]++; spawn(p); p.kills = 0; p.deaths = 0;p.ready=!!p.bot; }
}

function broadcast(r, now = Date.now()) {
  const players = [...r.players.values()].map(({ws, input, inputAt, lastShot, lastMissile, spawnedAt, slot, signedSpeed, ...p}) => ({
    ...p,
    pos: p.pos?.map(r1),
    yaw: r3(p.yaw || 0),
    pitch: r3(p.pitch || 0),
    velocity: p.velocity?.map(r1),
    mcd: r.phase === 'playing' ? Math.max(0, r1((lastMissile + MISSILE.cooldown - now) / 1000)) : 0,
    age: r.phase === 'playing' ? r1((now - spawnedAt) / 1000) : 0,
  }));
  const m = {
    type: 'state', serverTime: now, launchId:r.launchId,loadEndsAt:r.loadEndsAt,startsAt:r.startsAt, code: r.code, host: r.host, size: r.size, practice: !!r.practice, phase: r.phase,
    score: r.score.map(r1), time: Math.max(0, Math.ceil(r.remaining)), winner: r.winner, players,
    landingTeam:r.landingTeam,landingEndsAt:r.landingEndsAt,surface:surfaceSnapshot(r,now),
    shots: r.shots, missiles: (r.missiles || []).map(({id, team, by, target, pos, dir}) => ({id, team, by, target, pos: pos.map(r1), dir: dir.map(r3)})),
    booms: r.booms || [], feed: r.feed || [],
  };
  for (const p of r.players.values()) send(p.ws, m);
  r.shots = [];
  r.booms = [];
  r.feed = [];
  if(r.surface)r.surface.shots=[];
}

function leave(ws) {
  const r = rooms.get(ws.room);
  if (!r) return;
  r.players.delete(ws.pid);
  const humans = [...r.players.values()].filter(p => !p.bot);
  if (!humans.length) rooms.delete(r.code);
  else { if (r.host === ws.pid) r.host = humans[0].id; broadcast(r); }
  ws.room = null;
}

wss.on('connection', ws => {
  ws.pid = randomUUID();
  ws.alive = true;
  ws.on('pong', () => ws.alive = true);
  let start = Date.now(), count = 0;
  ws.on('message', raw => {
    try {
      if (Date.now() - start > 1000) { start = Date.now(); count = 0; }
      if (++count > 70) return;
      const m = JSON.parse(raw);
      if (!m || typeof m !== 'object') return;
      if (m.type === 'create' || m.type === 'join' || m.type === 'practice') {
        if (ws.room) return;
        let r;
        if (m.type === 'create' || m.type === 'practice') {
          if (rooms.size >= 200) return send(ws, {type: 'error', message: 'Server full. Try again later.'});
          let code;
          do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
          r = {code, host: ws.pid, size: m.type === 'practice' ? 1 : m.size === 8 ? 8 : 4, practice: m.type === 'practice', players: new Map(), phase: 'lobby', score: [0, 0], remaining: 300, shots: [], missiles: [], booms: [], feed: []};
          rooms.set(code, r);
        } else r = rooms.get(String(m.code).trim().toUpperCase());
        if (!r) return send(ws, {type: 'error', message: 'Room not found. Check the six-character code.'});
        if ([...r.players.values()].filter(p => !p.bot).length >= r.size * 2) return send(ws, {type: 'error', message: 'This room is full.'});
        if (r.phase !== 'lobby') return send(ws, {type: 'error', message: 'Match in progress. Wait for the rematch.'});
        const counts = [0, 0];
        for (const p of r.players.values()) counts[p.team]++;
        const p = {
          id: ws.pid, ws, name: String(m.name || 'Pilot').trim().slice(0, 18) || 'Pilot',
          ship: Object.hasOwn(specs, m.ship) ? m.ship : 'interceptor', team: counts[0] <= counts[1] ? 0 : 1,
          practice: !!r.practice, kills: 0, deaths: 0, lastShot: 0, slot: counts[counts[0] <= counts[1] ? 0 : 1],
        };
        spawn(p);
        r.players.set(p.id, p);
        ws.room = r.code;
        if (r.practice) {
          r.startSurface=m.mission==='surface';
          const bot = {id: randomUUID(), name: 'KEPLER', ship: 'interceptor', team: 1, bot: true, practice: true, kills: 0, deaths: 0};
          r.players.set(bot.id, bot);
          startMatch(r);
        }
        send(ws, {type: 'joined', id: p.id});
        broadcast(r);
      } else {
        const r = rooms.get(ws.room);
        if (!r) return;
        const p = r.players.get(ws.pid);
        if (m.type === 'leave') return leave(ws);
        if(m.type==='ready'&&r.phase==='loading'&&m.launchId===r.launchId)p.ready=true;
        if (m.type === 'start' && r.host === p.id && r.phase === 'lobby') {
          const humans=[...r.players.values()].filter(q=>!q.bot);
          if(humans.length!==r.size*2||[0,1].some(team=>humans.filter(q=>q.team===team).length!==r.size)){send(ws,{type:'error',message:'Waiting for all '+r.size*2+' real players to join.'});return;}
          startMatch(r);broadcast(r);
        }
        if (m.type === 'restart' && r.practice && r.host === p.id) { if(m.mission==='surface')r.startSurface=true;startMatch(r); broadcast(r); }
        if(m.type==='surfaceInput')acceptSurfaceInput(r,p.id,m,Date.now());
        if(m.type==='surfaceRespawn'&&r.phase==='surface'){
          const soldier=r.surface.soldiers.find(s=>s.id===p.id);
          if(soldier?.dead&&Date.now()-soldier.dead>=4000){soldier.dead=0;soldier.hp=120;soldier.pos=[0,1.65,10];soldier.input={};soldier.inputAt=0;}
        }
        if (m.type === 'respawn' && !r.practice && p.dead && Date.now() >= p.dead && r.phase === 'playing') { spawn(p); broadcast(r); }
        if (m.type === 'rematch' && r.host === p.id && r.phase === 'ended') {
          if (r.practice) startMatch(r);
          else { for (const [id, q] of r.players) if (q.bot) r.players.delete(id); r.phase = 'lobby';r.surface=null;r.landingTeam=null;r.landingEndsAt=null; }
          broadcast(r);
        }
        if (m.type === 'input' && r.phase === 'playing') {
          const clamp = x => Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
          p.input = {turn: clamp(m.turn), pitch: clamp(m.pitch), thrust: clamp(m.thrust), boost: !!m.boost, fire: !!m.fire, missile: !!m.missile, aimYaw:clamp(m.aimYaw), aimPitch:clamp(m.aimPitch)};
          p.inputAt = Date.now();
        }
      }
    } catch { send(ws, {type: 'error', message: 'Invalid request.'}); }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});

// ------------------------------------------------------------------ simulation (20 Hz)
const len = v => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

function kill(r, killer, victim, now, how) {
  victim.dead = now + 4000;
  victim.deaths = (victim.deaths || 0) + 1;
  if (killer) killer.kills++;
  r.booms.push({pos: victim.pos.map(r1), kind: 'ship', team: victim.team});
  r.feed.push({by: killer?.name || '', bt: killer?.team ?? victim.team, victim: victim.name, vt: victim.team, how});
}

function launchMissile(r, p, dir, now) {
  const target = p.lockProgress>=1 ? r.players.get(p.lockId) : null;
  if(!target||target.dead||target.team===p.team)return;
  p.lastMissile = now;
  const rail = [Math.cos(p.yaw)*7,-2,Math.sin(p.yaw)*7];
  r.missiles.push({id: randomBytes(3).toString('hex'), team: p.team, by: p.id, target: target?.id ?? null, pos: p.pos.map((v, j) => v + dir[j] * 7 + rail[j]), dir: [...dir], ttl: MISSILE.ttl});
}

function stepMissiles(r, now, dt) {
  const keep = [];
  for (const m of r.missiles) {
    const target = m.target ? r.players.get(m.target) : null;
    if (target && !target.dead) {
      const want = norm(sub(target.pos, m.pos));
      const steering=1-Math.pow(1-MISSILE.steer,dt/.05);
      m.dir = norm(m.dir.map((v, j) => v + (want[j] - v) * steering));
    }
    const launchSpeed = 65 + (MISSILE.speed-65)*Math.min(1,(MISSILE.ttl-m.ttl)/.65);
    m.pos = m.pos.map((v, j) => v + m.dir[j] * launchSpeed * dt);
    m.ttl -= dt;
    const near = target && !target.dead && len(sub(target.pos, m.pos)) < MISSILE.fuse;
    if (near || m.ttl <= 0 || len(m.pos) > 6200) {
      const owner = r.players.get(m.by);
      r.booms.push({pos: m.pos.map(r1), kind: 'missile', team: m.team});
      for (const q of r.players.values()) {
        if (q.team === m.team || q.dead) continue;
        const d = len(sub(q.pos, m.pos));
        if (d > MISSILE.radius) continue;
        q.hp = Math.max(0, q.hp - Math.round(MISSILE.damage * (1 - d / MISSILE.radius * .35)));
        if (!q.hp) kill(r, owner, q, now, 'missile');
      }
      continue;
    }
    keep.push(m);
  }
  r.missiles = keep;
}

let previousTick=performance.now();
setInterval(() => {
  const tick=performance.now(),dt=Math.min(.1,(tick-previousTick)/1000);previousTick=tick;
  const now = Date.now();
  for (const r of rooms.values()) {
    if(r.phase==='landing'||r.phase==='surface'){stepSurface(r,now,dt);broadcast(r,now);continue;}
    if(r.phase==='loading'||r.phase==='countdown'){
      const humans=[...r.players.values()].filter(p=>!p.bot);
      if(!r.practice&&humans.length!==r.size*2){r.phase='lobby';r.launchId=null;broadcast(r,now);continue;}
      if(r.phase==='loading'&&now>=r.loadEndsAt&&humans.every(p=>p.ready)){r.phase='countdown';r.startsAt=now+COUNTDOWN_MS;r.startedAt=r.startsAt;}
      if(r.phase==='countdown'&&now>=r.startsAt){r.phase='playing';for(const p of r.players.values()){p.spawnedAt=now;p.lastShot=now;p.lastMissile=now-MISSILE.cooldown;}if(r.startSurface){beginLanding(r,0,now);broadcast(r,now);continue;}}
      else{broadcast(r,now);continue;}
    }
    if (r.phase !== 'playing') continue;
    r.remaining = Math.max(0,300-(now-r.startedAt)/1000);
    const inside = [0, 0];
    const all = [...r.players.values()];
    for (const p of all) {
      if (p.dead) { if (p.bot && now >= p.dead) spawn(p); else continue; }
      const i = p.bot ? botInput(p, all, 300 - r.remaining) : now - (p.inputAt || 0) < 350 ? p.input : {};
      p.yawRate=(i.turn||0)*1.1;p.pitchRate=i.pitch||0;
      p.yaw += p.yawRate * dt;
      p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch + (i.pitch || 0) * dt));
      const dir = [Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
      const thrust=i.boost?1:(i.thrust||0);
      const wantedSpeed = thrust * specs[p.ship].speed * (i.boost ? 2.4 : 1);
      p.signedSpeed+=(wantedSpeed-p.signedSpeed)*(1-Math.exp(-dt*8));
      if(Math.abs(p.signedSpeed)<.1)p.signedSpeed=0;
      const speed=p.signedSpeed;
      p.velocity=dir.map(v=>v*speed);
      p.pos = p.pos.map((v, j) => Math.max(-3600, Math.min(3600, v + dir[j] * speed * dt)));
      p.thr = thrust;p.speed=Math.abs(speed);
      p.bst = !!i.boost;
      if (Math.hypot(...p.pos) < ZONE_RADIUS) inside[p.team]++;
      const aim=weaponDirection(p.yaw,p.pitch,i.aimYaw||0,i.aimPitch||0);
      acquireLock(p,all,aim,dt);
      if (i.fire && now - p.lastShot > (p.bot ? 650 : 240)) {
        p.lastShot = now;
        let target = null, best = 900;
        for (const q of r.players.values()) {
          if (q.team === p.team || q.dead) continue;
          const delta = q.pos.map((v, j) => v - p.pos[j]);
          const along = delta.reduce((v, x, j) => v + x * aim[j], 0);
          const perp = Math.sqrt(Math.max(0, delta.reduce((v, x) => v + x * x, 0) - along * along));
          if (along > 0 && along < best && perp < 15) { target = q; best = along; }
        }
        r.shots.push({from: p.pos.map(r1), to: p.pos.map((v, j) => r1(v + aim[j] * best)), team: p.team, by: p.id, hit: target?.id ?? null});
        if (target) {
          target.hp = Math.max(0, target.hp - 17);
          if (!target.hp) kill(r, p, target, now, 'laser');
        }
      }
      if (i.missile && p.lockProgress>=1 && now - p.lastMissile > MISSILE.cooldown) launchMissile(r, p, aim, now);
    }
    stepMissiles(r, now, dt);
    const defeatedTeam=orbitalWinner(all);
    if(defeatedTeam!==null){beginLanding(r,defeatedTeam,now);broadcast(r,now);continue;}
    if (inside[0] && !inside[1]) r.score[0] += dt * 2;
    if (inside[1] && !inside[0]) r.score[1] += dt * 2;
    if (r.remaining <= 0 || Math.max(...r.score) >= 100) {
      r.phase = 'ended';
      r.winner = r.score[0] === r.score[1] ? 'DRAW' : r.score[0] > r.score[1] ? 'ARES' : 'ORION';
    }
    broadcast(r, now);
  }
}, 50);

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000).unref();

server.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('Mars 3D: http://localhost:' + (process.env.PORT || 3001)));
