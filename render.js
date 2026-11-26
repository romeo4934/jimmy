// Court taper follows the front and back singles baselines measured on hard court.
const courtTaper = .112;
export function project(x, y, z = 0) {
  const depth = 1 - courtTaper * y;
  return [400 + 237 * x / depth, 235 + 166 * y / depth - 205 * z];
}

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
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
  function player(p, index, view, stateToss) {
    const [x, y] = project(...flip(p.x, p.y, view));
    const stride = p.vx || p.vy ? Math.round(3 * Math.sin((p.x + p.y) * 46)) : 0;
    const scale = index === view ? 1.48 : 1.15;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
    ellipse(0, 0, 14, 5, '#142d3280');
    const color = index ? '#ffab91' : '#eef595';
    const racketRaised = p.charge || stateToss || p.stroke && !p.swing;
    const followThrough = p.swing > 6 ? (p.power ?? 0) : 0;
    const racketX = racketRaised ? 27 : p.swing > 6 ? 29 + 9 * followThrough : 21;
    const racketY = racketRaised ? -31 : p.swing > 6 ? -21 - 7 * followThrough : -13;
    const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    rect('#1a3035', -8,-16,16,8); rect('#efb58a',-7,-8-stride,5,6); rect('#efb58a',2,-8+stride,5,6);
    rect('#fff8dc',-9,-3-stride,7,3); rect('#fff8dc',2,-3+stride,7,3);
    rect(color,-9,-29,18,13); rect('#efb58a',-5,-38,10,9); rect('#304348',-6,-40,12,4);
    const racketSide = (p.stroke === 'backhand' ? -1 : 1) * (index === view ? 1 : -1);
    ctx.scale(racketSide,1);
    rect('#efb58a',-12,-24,4,8);
    shape([[8,-25],[13,-19],[racketX-4,racketY-2]],null,'#efb58a',4);
    ctx.save(); ctx.translate(racketX,racketY);
    ctx.rotate(.45); ctx.strokeStyle = '#fbf2dd'; ctx.lineWidth = 2; ctx.strokeRect(-4,-6,8,12);
    ctx.restore(); ctx.restore();
  }
  function ball(b, view) {
    const position = flip(b.x,b.y,view);
    const [sx, sy] = project(...position);
    const [x,y] = project(...position,b.z);
    ellipse(sx,sy,11,5,'#10252ed0');
    ellipse(sx,sy,6,2.6,'#13262b');
    ellipse(x,y,8,8,'#152f32');
    ellipse(x,y,6.6,6.6,'#f5ff97');
    ellipse(x-1.5,y-2.2,2,2,'#ffffe2');
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
  return (state, view, active, destination, maxPower) => {
    ctx.fillStyle = '#254b43'; ctx.fillRect(0,0,canvas.width,canvas.height);
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
    player(state.players[1-view],1-view,view,state.toss && state.server === 1-view);
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
    player(p,view,view,state.toss && state.server === view);
    if (b && !far) ball(b,view);
    if (active) {
      if (state.drill && p.stroke && !p.swing) {
        ctx.textAlign = 'center'; ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = '#f8f6dd';
        ctx.fillText(p.stroke.toUpperCase(),x,feet-70);
      }
      if (destination) aimArrow(x, feet, destination);
      if (destination?.lift) {
        const lift = Math.round(destination.lift * 100);
        ctx.textAlign = x > 718 ? 'right' : 'left';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = '#f8f6dd';
        ctx.fillText('LIFT ' + (lift > 0 ? '+' : '') + lift + '%', x > 718 ? x-23 : x+23, feet-52);
      }
      if (destination?.releaseReady) {
        ctx.fillStyle = '#102c29';
        ctx.fillRect(x-34,feet-94,68,20);
        ctx.textAlign = 'center'; ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillStyle = '#fff6af';
        ctx.fillText('RELÂCHE',x,feet-80);
      }
      if (destination || p.charge || p.swing && p.power) powerBar(x, feet, p.power, maxPower);
    }
    ctx.textAlign = 'left'; ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#f8f6dd';
    const call = state.ball && state.rally > 0 ? state.call + ' · ' + state.rally + (state.rally === 1 ? ' RETURN' : ' RETURNS') : state.call;
    if (!state.drill) ctx.fillText(active ? call.toUpperCase() : 'HARD COURT  /  SINGLES',18,66,148);
  };
}
