// Court taper follows the front and back singles baselines measured on hard court.
const courtTaper = .112;
export function project(x, y, z = 0) {
  const depth = 1 - courtTaper * y;
  return [400 + 237 * x / depth, 235 + 166 * y / depth - 205 * z];
}

function drawAthlete(ctx, player, stride, raised, followThrough, direction) {
  const { shirt, trim, skin, hair, shorts, style } = player;
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const ink = '#172a33';
  const racketX = raised ? 27 : 21 + 8 * followThrough;
  const racketY = raised ? -32 : -14 - 9 * followThrough;
  ctx.save();
  ctx.scale(direction, 1);
  // Offset the feet and knees with the stride. Dark edges keep the pose readable across the net.
  rect(ink, -12, -15, 9, 12 - stride);
  rect(ink, 3, -14, 9, 11 + stride);
  rect(skin, -11, -13, 6, 8 - stride);
  rect(skin, 4, -12, 6, 7 + stride);
  rect('#d7e2df', -12, -6 - stride, 6, 4);
  rect('#d7e2df', 5, -5 + stride, 6, 4);
  rect(ink, -15, -3 - stride, 10, 4);
  rect(ink, 4, -2 + stride, 11, 4);
  rect('#f5edd9', -14, -3 - stride, 8, 2);
  rect('#f5edd9', 5, -2 + stride, 9, 2);
  rect(ink, -9, -19, 18, 8);
  rect(shorts, -8, -18, 7, 6);
  rect(shorts, 1, -18, 7, 6);
  rect(trim, -8, -15, 1, 3);
  rect(ink, -11, -34, 21, 17);
  rect(shirt, -10, -33, 19, 15);
  rect(trim, -9, -32, 17, 3);
  rect(trim, -7, -23, 4, 4);
  rect(skin, -13, -29, 4, 9);
  rect('#f5edd9', -13, -22, 4, 2);
  rect(skin, -4, -36, 8, 5);
  rect(ink, -7, -46, 14, 13);
  rect(skin, -5, -44, 11, 10);
  rect(hair, -6, -46, 12, 4);
  rect(hair, -6, -43, 3, 5);
  rect(ink, 3, -40, 2, 1);
  if (style === 'ponytail') {
    rect(hair, -9, -43, 4, 8);
    rect(trim, -8, -43, 2, 2);
  } else if (style === 'curls') {
    rect(hair, -7, -47, 4, 5);
    rect(hair, -2, -49, 5, 5);
    rect(hair, 3, -48, 4, 5);
  } else if (style === 'visor') {
    rect(trim, -6, -45, 12, 3);
    rect('#fff0c4', 5, -44, 4, 2);
  }
  ctx.beginPath();
  ctx.moveTo(8, -28);
  ctx.lineTo(13, -23);
  ctx.lineTo(racketX - 4, racketY + 1);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = skin;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.translate(racketX, racketY);
  ctx.rotate(.43);
  rect(ink, -2, 4, 4, 9);
  rect('#b4916f', -1, 8, 2, 4);
  ctx.beginPath();
  ctx.ellipse(0, -2, 5.8, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#304d51';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  for (const x of [-2.5, 0, 2.5]) rect('#e5e7cd', x - .3, -9, .6, 14);
  for (const y of [-6, -3, 0, 3]) rect('#e5e7cd', -5, y - .3, 10, .6);
  ctx.restore();
  ctx.restore();
}

export function drawPlayerPreview(canvas, player) {
  const ctx = canvas.getContext('2d');
  ctx.translate(51, 85);
  ctx.scale(1.6, 1.6);
  drawAthlete(ctx, player, 2, true, 0, 1);
}

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const baseWidth = canvas.width;
  const baseHeight = canvas.height;
  let scaleX = 1, scaleY = 1, originX = 0, originY = 0, spriteAspect = 1;
  new ResizeObserver(([{ contentRect: { width, height } }]) => {
    if (!width || !height) return;
    const wide = getComputedStyle(canvas).getPropertyValue('--court-fill').trim() === '1';
    const density = wide ? Math.min(window.devicePixelRatio || 1, 2, 1800 / Math.max(width, height)) : 1;
    const nextWidth = wide ? Math.round(width * density) : baseWidth;
    const nextHeight = wide ? Math.round(height * density) : baseHeight;
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    ctx.imageSmoothingEnabled = false;

    // Trim the empty space below the near player's movement bounds. Widen
    // the court for landscape while keeping the players and ball undistorted.
    const viewHeight = wide ? 500 : baseHeight;
    scaleY = Math.min(nextWidth / baseWidth, nextHeight / viewHeight);
    scaleX = Math.min(nextWidth / baseWidth, scaleY * (wide ? 1.43 : 1));
    originX = (nextWidth - baseWidth * scaleX) / 2;
    originY = (nextHeight - viewHeight * scaleY) / 2;
    spriteAspect = scaleY / scaleX;
  }).observe(canvas);
  const flip = (x, y, view) => view === 1 ? [-x, -y] : [x, y];
  const shape = (points, fill, stroke, width = 2) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  };
  const quad = (x0, y0, x1, y1, fill, stroke) =>
    shape([[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]].map(p => project(...p)), fill, stroke);
  const ellipse = (x, y, w, h, fill) => {
    ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
  };
  const label = (text, x, y, width) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(spriteAspect, 1);
    if (width === undefined) ctx.fillText(text, 0, 0);
    else ctx.fillText(text, 0, 0, width);
    ctx.restore();
  };
  function player(p, index, view, stateToss, appearance) {
    const [x, y] = project(...flip(p.x, p.y, view));
    const stride = p.vx || p.vy ? Math.round(3 * Math.sin((p.x + p.y) * 46)) : 0;
    const scale = index === view ? 1.48 : 1.15;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale * spriteAspect, scale);
    ellipse(0, 0, 15, 5, '#142d3280');
    const raised = p.charge || stateToss || p.stroke && !p.swing;
    const followThrough = p.swing > 6 ? (p.power ?? 0) : 0;
    const direction = (p.stroke === 'backhand' ? -1 : 1) * (index === view ? 1 : -1);
    drawAthlete(ctx, appearance, stride, raised, followThrough, direction);
    ctx.restore();
  }
  function ball(b, view) {
    const position = flip(b.x,b.y,view);
    const [sx, sy] = project(...position);
    const [x,y] = project(...position,b.z);
    ellipse(sx,sy,11 * spriteAspect,5,'#10252ed0');
    ellipse(sx,sy,6 * spriteAspect,2.6,'#13262b');
    ellipse(x,y,8 * spriteAspect,8,'#152f32');
    ellipse(x,y,6.6 * spriteAspect,6.6,'#f5ff97');
    ellipse(x-1.5 * spriteAspect,y-2.2,2 * spriteAspect,2,'#ffffe2');
  }
  function aimArrow(x, feet, destination) {
    const [tx, ty] = project(destination.x, destination.y);
    const distance = Math.hypot(tx - x, ty - feet);
    const ux = (tx - x) / distance;
    const uy = (ty - feet) / distance;
    const start = [x + ux * 59, feet + uy * 59];
    const end = [x + ux * 108, feet + uy * 108];
    const points = [[end[0] - ux * 12 - uy * 7, end[1] - uy * 12 + ux * 7], end,
      [end[0] - ux * 12 + uy * 7, end[1] - uy * 12 - ux * 7]];
    for (const [color, width] of [['#163632', 7], ['#eef595', 3]]) {
      shape([start,end],null,color,width);
      shape(points,null,color,width);
    }
  }
  function powerBar(x, feet, power, maxPower) {
    const left = x > 718 ? x - 73 : x + 23;
    const top = feet - 46;
    ctx.fillStyle = '#102c29'; ctx.fillRect(left,top,52,10);
    ctx.strokeStyle = '#f8f6dd'; ctx.lineWidth = 1.5; ctx.strokeRect(left,top,52,10);
    const base = 48 * Math.min(power, 1) / maxPower;
    ctx.fillStyle = '#eef595'; ctx.fillRect(left+2,top+2,base,6);
    if (maxPower > 1) {
      const extra = 48 * Math.max(0, power - 1) / maxPower;
      ctx.fillStyle = '#ffb870'; ctx.fillRect(left+2+base,top+2,extra,6);
      ctx.fillStyle = '#f8f6dd'; ctx.fillRect(left+26,top+2,1,6);
    }
  }
  return (state, view, active, destination, maxPower, ownPlayer, opponentPlayer) => {
    ctx.resetTransform();
    ctx.fillStyle = '#254b43'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(scaleX, 0, 0, scaleY, originX, originY);
    ctx.fillStyle = '#172f34'; ctx.fillRect(0,0,800,48);
    for (let x = -8; x < 800; x += 24) {
      shape([[x,1],[x+17,1],[x+17,32],[x,32]],'#203f42');
      shape([[x+12,1],[x+12,33]],null,'#315254',1);
    }
    ctx.fillStyle = '#436458'; ctx.fillRect(0,45,800,4);
    quad(-1.42,-1.24,1.42,1.31,'#30594e');
    quad(-4/3,-1,4/3,1,'#46667d','#e4ece4');
    quad(-1,-1,1,1,'#305d83','#e4ece4');
    quad(-1,-.54,1,.54,'#326287','#e4ece4');
    shape([project(0,-.54),project(0,.54)],null,'#ecebd0');
    player(state.players[1-view],1-view,view,state.toss && state.server === 1-view, opponentPlayer);
    const b = state.ball || state.toss;
    const far = b && flip(b.x,b.y,view)[1] < 0;
    if (far) ball(b,view);
    const left = -1.39, right = 1.39, height = .055;
    shape([project(left,0),project(right,0),project(right,0,height),project(left,0,height)],'#22343bb0');
    for(let x=left;x<=right;x+=.045) shape([project(x,0),project(x,0,height)],null,'#d6e3ce50',1);
    shape([project(left,0,height),project(right,0,height)],null,'#efe8cb',3);
    for (const x of [left,right]) shape([project(x,0),project(x,0,height+.012)],null,'#e1e5cc',4);
    if (state.drill && b?.hitter === 1 && !b.bounces) {
      const left = b.flight - b.age;
      const [x,y] = project(b.x + b.vx * left, b.y + b.vy * left);
      ctx.beginPath(); ctx.ellipse(x,y,17,9,0,0,Math.PI * 2);
      ctx.setLineDash([5,4]); ctx.strokeStyle = '#e5fbff'; ctx.lineWidth = 2;
      ctx.stroke(); ctx.setLineDash([]);
    }
    const p = state.players[view];
    const [x, feet] = project(...flip(p.x, p.y, view));
    player(p,view,view,state.toss && state.server === view, ownPlayer);
    if (b && !far) ball(b,view);
    if (active) {
      if (state.drill && p.stroke && !p.swing) {
        ctx.textAlign = 'center'; ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = '#f8f6dd';
        label(p.stroke.toUpperCase(),x,feet-70);
      }
      if (destination) aimArrow(x, feet, destination);
      if (destination?.lift) {
        const lift = Math.round(destination.lift * 100);
        ctx.textAlign = x > 718 ? 'right' : 'left';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = '#f8f6dd';
        label('LIFT ' + (lift > 0 ? '+' : '') + lift + '%', x > 718 ? x-23 : x+23, feet-52);
      }
      if (destination?.releaseReady) {
        ctx.fillStyle = '#102c29';
        ctx.fillRect(x-34 * spriteAspect,feet-94,68 * spriteAspect,20);
        ctx.textAlign = 'center'; ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillStyle = '#fff6af';
        label('RELÂCHE',x,feet-80);
      }
      if (destination || p.charge || p.swing && p.power) powerBar(x, feet, p.power, maxPower);
    }
    ctx.textAlign = 'left'; ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#f8f6dd';
    const call = state.ball && state.rally > 0 ? state.call + ' · ' + state.rally + (state.rally === 1 ? ' RETURN' : ' RETURNS') : state.call;
    if (!state.drill) label(active ? call.toUpperCase() : 'HARD COURT  /  SINGLES',18,66,148);
  };
}
