const clamp = (value, limit = 1) => Math.max(-limit, Math.min(limit, value));
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// The bot uses the same steering, speed and hit detection as a human pilot.
export function botInput(bot, players, elapsed) {
  let enemy = null, distance = Infinity;
  for (const p of players) {
    if (p.team === bot.team || p.dead) continue;
    const d = dist(p.pos, bot.pos);
    if (d < distance) { distance = d; enemy = p; }
  }
  const capture = !enemy || distance > 600 || Math.hypot(...bot.pos) > 350;
  const destination = capture ? [0, 0, 0] : enemy.pos;
  const delta = destination.map((v, i) => v - bot.pos[i]);
  const yawError = angle(Math.atan2(delta[0], -delta[2]) - bot.yaw);
  const pitchError = Math.atan2(delta[1], Math.hypot(delta[0], delta[2])) - bot.pitch;
  const settled = Math.hypot(...bot.pos) < 95;
  // Short firing bursts and a gentle weave give the player room to react.
  const weave = !capture && distance < 320 ? Math.sin(elapsed * .8) * .05 : 0;
  const aligned = Math.abs(yawError) < .065 && Math.abs(pitchError) < .065;
  return {
    turn: clamp(yawError * 2.4 + weave),
    pitch: clamp(pitchError * 2),
    thrust: capture ? (settled ? 0 : .7) : distance > 210 ? .55 : distance < 120 ? -.35 : .08,
    boost: false,
    fire: !capture && elapsed > 3 && elapsed % 2.8 < 1.1 && distance < 650 && aligned,
    // Rockets are rarer than lasers: only on a clean head-on lock after the opening seconds.
    missile: !capture && elapsed > 9 && distance > 140 && distance < 800 && Math.abs(yawError) < .14 && Math.abs(pitchError) < .14,
  };
}
