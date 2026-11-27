const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const side = index => index ? -1 : 1;
const other = index => 1 - index;
const serveFrames = 62;
const serveFlight = 52;
const reach = .22;
const centerContactTolerance = .055;
const spinAcceleration = .00015;
const spinKick = .013;
const fullChargeFrames = 33;
export const maxRallyPower = 2;
const swingFrames = 23;
const swingAnimationFrames = 17;
const playerSpeed = .0275;
const touchSpeed = .0235;
export const courtBounds = { side: 1.22, net: .11, back: 1.29 };

function player(index, x = 0) {
  return { x, y: side(index) * 1.05, vx: 0, vy: 0, swing: 0, charge: null, usedShot: false, power: 0, stroke: null, pending: null };
}

const serviceSide = points => (points[0] + points[1]) % 2 ? -1 : 1;

function readyPlayers(server, points) {
  const courtSide = serviceSide(points);
  // A neutral serve reaches the receiver's baseline wider than its first bounce.
  return [0, 1].map(index => player(index, side(index) * courtSide * (index === server ? .34 : .61)));
}

export function newMatch(drill = false) {
  const points = [0, 0];
  return {
    players: drill ? [player(0), player(1)] : readyPlayers(0, points), points, games: [0, 0], server: 0,
    winner: null, ball: null, toss: null, pause: 0, rally: 0,
    lastEvent: null, lastShots: [null, null], lastMisses: [null, null],
    drill: drill ? { attempt: 0, hits: 0, wait: 42, closest: null, closestFrame: null, chargeFrame: null } : null,
    call: drill ? 'Return drill · Ball 1 of 3' : 'Player 1 to serve'
  };
}

function event(match, type, detail) {
  match.lastEvent = { id: (match.lastEvent?.id ?? 0) + 1, type, ...detail };
}

const feeds = [0, -.50, .50];

function feedBall(match) {
  const drill = match.drill;
  match.players = [player(0), player(1)];
  match.rally = 0;
  match.lastShots = [null, null];
  match.lastMisses = [null, null];
  drill.closest = drill.closestFrame = drill.chargeFrame = null;
  match.players[1].power = .35;
  match.players[1].swing = 12;
  const flight = 72, gravity = .00044, z = .22, y = -.95;
  match.ball = {
    x: 0, y, z, vx: feeds[drill.attempt] / flight, vy: (.71 - y) / flight,
    vz: (gravity * flight * (flight + 1) / 2 - z) / flight,
    gravity, hitter: 1, bounces: 0, age: 0, flight, serve: false
  };
  match.call = 'Ball ' + (drill.attempt + 1) + ' of ' + feeds.length + ' · Get ready';
  event(match, 'hit', { player: 1, power: .35, shot: 'drive' });
}

function finishDrillBall(match, success, reason) {
  const drill = match.drill;
  drill.attempt++;
  if (success) drill.hits++;
  match.ball = null;
  drill.wait = 85;
  match.call = drill.attempt === feeds.length
    ? drill.hits + ' / ' + feeds.length + ' returns · Drill complete'
    : reason + ' · ' + drill.attempt + ' / ' + feeds.length;
  event(match, 'drill', {
    attempt: drill.attempt, side: ['center', 'left', 'right'][drill.attempt - 1], success, reason,
    closest: drill.closest, closestFrame: drill.closestFrame, chargeFrame: drill.chargeFrame,
    shot: match.lastShots[0], miss: match.lastMisses[0],
    drillComplete: drill.attempt === feeds.length
  });
}

function award(match, winner, reason) {
  if (match.drill) {
    const { closest, closestFrame, chargeFrame } = match.drill;
    const miss = match.lastMisses[0];
    const feedback = match.ball.hitter === 0 ? reason : miss
      ? miss.needed ? 'Wrong side · ' + miss.needed + ' needed' : 'Swing too early'
      : closest === null || closest > reach ? 'Too far from ball'
        : chargeFrame === null || chargeFrame > closestFrame ? 'Hold Drive earlier' : 'Release Drive near contact';
    finishDrillBall(match, false, feedback);
    return;
  }
  event(match, 'point', { winner, reason, returns: match.rally });

  match.ball = null;
  match.toss = null;
  match.pause = 55;
  match.points[winner]++;
  match.call = reason + ' · Point Player ' + (winner + 1);
  if (match.points[winner] >= 4 && match.points[winner] - match.points[other(winner)] >= 2) {
    match.games[winner]++;
    match.points = [0, 0];
    match.server = other(match.server);
    match.call = 'Game Player ' + (winner + 1);
    if (match.games[winner] === 3) {
      match.winner = winner;
      match.call = 'Player ' + (winner + 1) + ' wins the match';
    }
  }
  match.players = readyPlayers(match.server, match.points);
}

function aimMovement(p, input, index) {
  if (!input.target) return input;
  const orientation = side(index);
  const x = (clamp(input.target.x, -courtBounds.side, courtBounds.side) - p.x * orientation) / playerSpeed;
  const y = (clamp(input.target.y, courtBounds.net, courtBounds.back) - p.y * orientation) / playerSpeed;
  const scale = 1 / Math.max(1, Math.hypot(x, y));
  return { ...input, x: Math.abs(x) < .00001 ? 0 : x * scale,
    y: Math.abs(y) < .00001 ? 0 : y * scale, fixedMove: true };
}

function move(p, input, index) {
  if (input.held === 'drive') {
    p.vx = p.vy = 0;
    return;
  }
  const runSpeed = input.cpu ? .025 : playerSpeed;
  let speed = runSpeed;
  if (input.fixedMove && !input.target) speed = input.walk ? runSpeed * .4 : touchSpeed;
  const scale = speed / Math.max(1, Math.hypot(input.x, input.y));
  if (input.fixedMove) {
    p.vx = input.x * scale;
    p.vy = input.y * scale;
  } else {
    p.vx = input.x ? p.vx + (input.x * scale - p.vx) * .72 : 0;
    p.vy = input.y ? p.vy + (input.y * scale * .78 - p.vy) * .72 : 0;
  }
  p.x = clamp(p.x + p.vx * side(index), -courtBounds.side, courtBounds.side);
  p.y = side(index) * clamp(p.y * side(index) + p.vy, courtBounds.net, courtBounds.back);
}

function shotAim(p, input, index, previous = 0) {
  if (!input.target) return input.x || previous;
  const delta = input.target.x - p.x * side(index);
  return Math.abs(delta) < .025 ? 0 : clamp(delta * 2.5, -1, 1);
}

function shotLift(input, previous = 0) {
  if (Math.abs(input.y) > .15) return -input.y;
  return input.fixedMove ? 0 : previous;
}

function shotTarget(match, localX, shot, aim, serve, offset = 0) {
  const courtSide = serviceSide(match.points);
  return {
    x: serve ? -courtSide * (.36 - aim * courtSide * .21) :
      aim * .78 + localX * .11 + clamp(offset * 2.1, -.28, .28) * (1 - .55 * Math.abs(aim)),
    y: serve ? -.49 : shot === 'lob' ? -.92 : -.80
  };
}

export function drivePreview(match, index, input) {
  const p = match.players[index];
  if (input.held !== 'drive' || p.usedShot || match.pause || match.winner !== null) return null;
  const serve = !match.ball && match.server === index;
  const previous = serve ? match.toss?.aim : p.charge?.aim;
  const predicted = predictContact(match.ball, p, index);
  const x = predicted?.x ?? p.x;
  if (predicted && wrongSide(predicted, p, index)) return null;
  const orientation = side(index);
  const target = shotTarget(match, x * orientation, 'drive', shotAim(p, input, index, previous),
    serve, (x - p.x) * orientation);
  return { ...target, lift: serve ? 0 : shotLift(input, p.charge?.lift),
    releaseReady: !!predicted && predicted.age - match.ball.age < swingFrames };
}

function ballPace(ball) {
  // The two court axes are normalized separately. Scale the width to the same units as the length.
  return Math.hypot(ball.vx * .346, ball.vy);
}

function launch(match, index, start, shot, aim, serve, power, lift = 0, releaseLeadFrames = null) {
  const orientation = side(index);
  const lob = shot === 'lob';
  const speed = 92 + Math.round(9 * power);
  const incomingSpeed = serve ? 0 : ballPace(match.ball);
  const paceFactor = clamp(1 + (incomingSpeed - .028) * 5, .94, 1.10);
  const returnFrames = (lob ? 74 - 11 * power : 61 - 9 * power) / paceFactor;
  const regularFlight = Math.round(serve ? serveFlight * 101 / speed : returnFrames);
  const boost = !serve && !lob && releaseLeadFrames !== null
    ? .22 * clamp((power - .5) / .5, 0, 1) * clamp((14 - releaseLeadFrames) / 12, 0, 1) : 0;
  const frames = Math.round(regularFlight / (1 + boost));
  const pace = regularFlight / frames;
  // Preserve the arc and landing point when the same shot travels faster.
  const gravity = (serve ? .00040 : lob ? .00064 : .00044 * (1 + .30 * lift)) * pace ** 2;
  const p = match.players[index];
  const offset = (start.x - p.x) * orientation;
  const target = shotTarget(match, start.x * orientation, shot, aim, serve, offset);
  const spin = serve ? orientation * Math.sign(aim) * Math.max(0, (Math.abs(aim) - .45) / .55) : 0;
  const drift = spin * spinAcceleration * frames * (frames - 1) / 2;
  match.ball = {
    ...start, vx: (target.x * orientation - start.x - drift) / frames, vy: (target.y * orientation - start.y) / frames,
    spin, lift,
    vz: (gravity * frames * (frames + 1) / 2 - start.z) / frames,
    gravity, hitter: index, bounces: 0, age: 0, flight: frames, serve
  };
  match.toss = null;
  const detail = {
    player: index, shot, aim, power, serve,
    ...(serve && spin ? { spin: Math.round(spin * orientation * 100) / 100 } : {}),
    ...(serve ? {} : { stroke: p.stroke, offset: Math.round(offset * 1000) / 1000,
      landingX: Math.round(target.x * 1000) / 1000,
      incomingSpeed: Math.round(incomingSpeed * 10000) / 10000,
      returnSpeed: Math.round(ballPace(match.ball) * 10000) / 10000,
      ...(lob ? {} : { lift: Math.round(lift * 100) / 100, releaseLeadFrames,
        paceBoost: Math.round((pace - 1) * 1000) / 1000 }) })
  };
  match.lastShots[index] = detail;
  event(match, 'hit', detail);
  p.swing = 12;
  p.power = power;
  p.charge = null;
  p.usedShot = true;
  match.call = serve ? (spin ? 'Spin serve · ' : 'Serve · ') + speed + ' MPH' : lob ? 'Lob' : boost >= .1 ? 'Power drive' : 'Drive';
  if (!serve) match.rally++;
}

function startToss(match, input) {
  const p = match.players[match.server];
  const courtSide = serviceSide(match.points);
  p.y = side(match.server) * 1.05;
  p.x = side(match.server) * courtSide * clamp(Math.abs(p.x), .20, .70);
  match.rally = 0;
  match.lastShots = [null, null];
  match.lastMisses = [null, null];
  p.vx = p.vy = 0;
  p.power = 0;
  p.stroke = null;
  match.toss = { age: 0, aim: input.x, x: p.x, y: p.y, z: .18, heldFrames: 0 };
  match.call = 'Ball toss';
}

function stepToss(match, input) {
  const toss = match.toss;
  const p = match.players[match.server];
  const age = ++toss.age;
  const progress = Math.min(age, serveFrames) / serveFrames;
  toss.z = .18 + progress * .11 + Math.sin(progress * Math.PI) * .30 -
    Math.max(0, age - serveFrames) * .014;
  if (!input.held) {
    const { x, y, z, aim } = toss;
    launch(match, match.server, { x, y, z }, 'drive', aim, true, p.power);
    move(p, aimMovement(p, input, match.server), match.server);
    return;
  }
  if (age > serveFrames + 18) {
    match.toss = null;
    p.power = 0;
    match.call = 'Toss missed · Try again';
    event(match, 'serve_miss', { player: match.server });
    return;
  }
  toss.aim = shotAim(p, input, match.server, toss.aim);
  toss.heldFrames = Math.min(toss.heldFrames + 1, serveFrames);
  p.power = (toss.heldFrames / serveFrames) ** 1.7;
}

function contact(ball, p, index) {
  return ball && ball.hitter !== index && ball.y * side(index) > 0 &&
    (!ball.serve || ball.bounces > 0) && ball.z < .32 &&
    Math.hypot(ball.x - p.x, (ball.y - p.y) * 1.2) <= reach;
}

function predictContact(ball, p, index, readCurrentPath = false) {
  if (!ball || ball.hitter === index) return null;
  const future = { ...ball };
  // Early preparation reads the current direction before the spin changes it.
  if (readCurrentPath) future.spin = 0;
  for (let i = 0; i < 140; i++) {
    if (contact(future, p, index)) return future;
    const outcome = advanceBall(future);
    if (outcome && outcome !== 'Bounce') return null;
  }
  return null;
}

function chooseStroke(ball, p, index) {
  const expected = predictContact(ball, p, index, true);
  const frames = ball.vy ? clamp((p.y - ball.y) / ball.vy, 0, 60) : 0;
  const ballX = expected?.x ?? ball.x + ball.vx * frames;
  return (ballX - p.x) * side(index) < -.005 ? 'backhand' : 'forehand';
}

function wrongSide(ball, p, index) {
  const offset = (ball.x - p.x) * side(index);
  if (Math.abs(offset) <= centerContactTolerance || !p.stroke) return null;
  const needed = offset < 0 ? 'backhand' : 'forehand';
  return needed === p.stroke ? null : needed;
}

export function cpuInput(match) {
  const p = match.players[1];
  const idle = { x: 0, y: 0, shot: null, held: null };
  if (match.toss && match.server === 1) {
    return match.toss.age < serveFrames ? { ...idle, held: 'drive' } : idle;
  }
  if (!match.ball && !match.toss && match.server === 1 && match.pause === 0) {
    return { ...idle, shot: 'drive', held: 'drive' };
  }
  const ball = match.ball;
  if (ball?.hitter !== 0) return idle;
  if (p.pending || p.swing) return idle;
  if (p.charge) return contact(ball, p, 1) ? idle :
    { ...idle, x: match.rally % 2 ? -1 : 0, held: 'drive' };
  // Line up for the ball after its first bounce, when it has dropped into reach.
  const toBounce = Math.max(0, ball.flight - ball.age);
  const rebound = Math.max(0, 23 - (ball.bounces ? ball.age - ball.flight : 0));
  const lead = toBounce + rebound * (ball.bounces ? 1 : .77);
  const x = clamp(ball.x + ball.vx * lead, -1.16, 1.16);
  const y = clamp(ball.y + ball.vy * lead, -1.27, -.20);
  const moveX = Math.abs(x - p.x) > .035 ? -Math.sign(x - p.x) : 0;
  const moveY = Math.abs(y - p.y) > .035 ? -Math.sign(y - p.y) : 0;
  return moveX || moveY ? { ...idle, x: moveX, y: moveY } : { ...idle, held: 'drive' };
}

function advanceBall(ball) {
  const previousY = ball.y;
  ball.age++;
  ball.x += ball.vx;
  ball.vx += (ball.spin ?? 0) * spinAcceleration;
  ball.y += ball.vy;
  ball.vz -= ball.gravity;
  ball.z += ball.vz;
  if (previousY * ball.y <= 0 && ball.z < .055) return 'Net';
  if (ball.z > 0 && (ball.bounces || ball.age !== ball.flight)) return null;
  if (ball.bounces) return 'Second bounce';
  if (Math.abs(ball.x) > 1 || Math.abs(ball.y) > 1 || ball.y * side(ball.hitter) >= 0) return 'Out';
  ball.bounces = 1;
  ball.z = .001;
  ball.vz *= -(.72 + .12 * (ball.lift ?? 0));
  ball.vx = ball.vx * .77 + (ball.spin ?? 0) * spinKick;
  ball.spin = 0;
  ball.vy *= .77;
  return 'Bounce';
}

function stepBall(match) {
  const ball = match.ball;
  const outcome = advanceBall(ball);
  if (!outcome) return;
  if (outcome === 'Bounce') {
    if (match.drill && ball.hitter === 0) finishDrillBall(match, true, 'Returned in');
    else event(match, 'bounce', { player: ball.hitter });
  } else {
    award(match, outcome === 'Second bounce' ? ball.hitter : other(ball.hitter), outcome);
  }
}

function strike(match, p, index, swing) {
  const { x, y, z } = match.ball;
  const needed = wrongSide(match.ball, p, index);
  if (needed) {
    const miss = { stroke: p.stroke, needed, releaseLeadFrames: swing.releaseLeadFrames };
    match.lastMisses[index] = miss;
    event(match, 'miss', { player: index, shot: swing.shot, ...miss });
    match.call = 'Wrong side · ' + needed + ' needed';
    p.charge = null;
    p.usedShot = true;
    p.swing = 12;
  } else {
    launch(match, index, { x, y, z }, swing.shot, swing.aim, false, swing.power, swing.lift, swing.releaseLeadFrames);
  }
}

export function step(match, inputs) {
  if (match.winner !== null) return;
  if (match.drill && !match.ball) {
    if (match.drill.attempt < feeds.length && --match.drill.wait <= 0) feedBall(match);
    return;
  }
  if (match.pause > 0) {
    if (--match.pause === 0) match.call = 'Player ' + (match.server + 1) + ' to serve';
    return;
  }
  if (match.toss) {
    const receiver = other(match.server);
    move(match.players[receiver], aimMovement(match.players[receiver], inputs[receiver], receiver), receiver);
    stepToss(match, inputs[match.server]);
    return;
  }
  for (const [index, p] of match.players.entries()) {
    const input = aimMovement(p, inputs[index], index);
    if (p.swing > 0) p.swing--;
    if (p.charge?.shot === 'drive' && input.held !== 'drive') {
      const expected = predictContact(match.ball, p, index);
      p.pending = { shot: 'drive', aim: p.charge.aim, lift: p.charge.lift,
        power: p.power, frames: swingFrames,
        releaseLeadFrames: expected ? expected.age - match.ball.age : null };
      p.charge = null;
      p.swing = swingAnimationFrames;
    }
    if (p.pending) {
      if (contact(match.ball, p, index)) {
        strike(match, p, index, p.pending);
        p.pending = null;
      } else if (--p.pending.frames <= 0) {
        match.lastMisses[index] = { stroke: p.stroke, reason: 'early',
          releaseLeadFrames: p.pending.releaseLeadFrames };
        event(match, 'miss', { player: index, shot: 'drive', reason: 'early' });
        match.call = 'Swing too early';
        p.pending = null;
      }
      move(p, input, index);
      continue;
    }
    if (!input.held) {
      p.charge = null;
      p.usedShot = false;
    } else if (p.charge && p.charge.shot !== input.held) {
      p.charge = null;
      p.stroke = null;
    }
    if (!match.ball && input.shot && index === match.server) {
      startToss(match, input);
      return;
    }
    const incoming = match.ball?.hitter === other(index);
    const planted = input.held === 'drive' || !input.x && !input.y;
    if (!incoming) p.charge = null;
    if (!p.swing) {
      if (!incoming || !planted && !p.charge) p.stroke = null;
      else if (!p.stroke || !input.held) p.stroke = chooseStroke(match.ball, p, index);
    }
    if (incoming && !p.swing && !p.usedShot && input.held && !p.charge && planted) {
      p.charge = { shot: input.held, frames: 0, aim: 0, lift: 0 };
    }
    if (match.drill && index === 0 && incoming) {
      const ball = match.ball;
      if (p.charge && match.drill.chargeFrame === null) match.drill.chargeFrame = ball.age;
      if (ball.y > 0 && ball.z < .32) {
        const distance = Math.hypot(ball.x - p.x, (ball.y - p.y) * 1.2);
        if (distance < (match.drill.closest ?? Infinity)) {
          match.drill.closest = distance;
          match.drill.closestFrame = ball.age;
        }
      }
    }
    if (!p.charge) {
      p.power = p.swing ? p.power : 0;
      move(p, input, index);
      continue;
    }
    p.vx = p.vy = 0;
    p.charge.aim = shotAim(p, input, index, p.charge.aim);
    if (p.charge.shot === 'drive') p.charge.lift = shotLift(input, p.charge.lift);
    p.charge.frames = Math.min(p.charge.frames + 1, fullChargeFrames * maxRallyPower);
    p.power = p.charge.frames / fullChargeFrames;
    if (p.charge.shot === 'lob' && contact(match.ball, p, index)) {
      strike(match, p, index, { ...p.charge, power: p.power });
    }
  }
  if (match.ball) stepBall(match);
}
