const vadd = (a, b) => {
  return { x: a.x + b.x, y: a.y + b.y };
};

const vsub = (a, b) => {
  return { x: a.x - b.x, y: a.y - b.y };
};

const vdiv = (a, b) => {
  return { x: a.x / b, y: a.y / b };
};

const vmul = (a, b) => {
  return { x: a.x * b, y: a.y * b };
};

const vlen = a => {
  return Math.sqrt(a.x * a.x + a.y * a.y);
};

const file_picker = document.getElementById(`file-picker`);
const start_simulation_button = document.getElementById(`start-simulation-button`);
const stop_simulation_button = document.getElementById(`stop-simulation-button`);
const canvas = document.getElementById(`canvas`);

// A graph is a collection of node objects keyed by an id. Each node contains a
// label and a collection of edges to or from other nodes.
let nodes_by_id = {};
let nodes = [];
let sectors = [];
let sector_size = 100;

let width = 200;
let height = 200;

let zoom = { x: 1, y: 1 };
let pan = { x: 0, y: 0 };
let mouse_pos = { x: 0.5, y: 0.5 };

const get_render_context = () => {
  width = window.innerWidth - 20;
  height = window.innerHeight - 100;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgb(0, 0, 0)`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `rgb(255, 255, 255)`;

  return ctx;
};

const render_first_two_levels = () => {
  const ctx = get_render_context();

  let root;
  for (const node of nodes) {
    if (!root || node.height > root.height) {
      root = node;
    }
  }

  let center = width / 2;
  if (root) {
    ctx.fillRect(center - 2, 10, 4, 4);

    let len = root.outward.length;
    let i = 0;
    let spacing = width / len;
    for (let child of root.outward) {
      const x = center - 2 - (spacing / 2 * (len - 1)) + i * spacing;
      ctx.fillRect(x, 50, 4, 4);
      if (child.label) {
        const text_x = x - ctx.measureText(child.label).width / 2;
        ctx.fillText(child.label, text_x, 70);
      }
      i += 1;
    }
  }
};

const compute_heights = () => {
  const iter = node => {
    if (!node.height) {
      let max = -1;
      for (const other of node.inward) {
        iter(other);
        if (other.height > max) { max = other.height; }
      }
      node.height = max + 1;
    }
  };
  for (const node of nodes) {
    iter(node);
  }
};

const get_sector = node => {
  const x_sector = Math.floor(node.position.x / sector_size);
  const y_sector = Math.floor(node.position.y / sector_size);
  return sectors[x_sector][y_sector];
};

const set_sector = node => {
  const x_sector = Math.floor(node.position.x / sector_size);
  const y_sector = Math.floor(node.position.y / sector_size);
  if (!sectors[x_sector]) { sectors[x_sector] = []; }
  if (!sectors[x_sector][y_sector]) { sectors[x_sector][y_sector] = []; }
  const sector = sectors[x_sector][y_sector];
  if (sector.length < 100) { sector.push(node); }
};

const position_near_parent = () => {
  const iter = (node, scale) => {
    for (const [i, child] of node.outward.entries()) {
      if (!child.visited) {
        child.visited = true;
        child.position = { x: node.position.x + i * scale, y: node.position.y + 1000 };
        set_sector(child);
        iter(child, scale / 2);
      }
    }
  };
  nodes.sort((a, b) => b.height - a.height);
  for (const node of nodes) {
    if (!node.visited) {
      set_sector(node);
      node.visited = true;
      iter(node, 10000);
    }
  }
};

const position_by_height = () => {
  let max_height = 0;
  for (const node of nodes) {
    if (node.height > max_height) {
      max_height = node.height;
    }
  }

  let by_height = [];
  for (let i = 0; i < max_height + 1; i++) {
    by_height.push([]);
  }
  for (const node of nodes) {
    by_height[node.height].push(node);
  }

  for (const [x, row] of by_height.entries()) {
    for (const [y, node] of row.entries()) {
      node.position.x = x * 10 + Math.random() * 5;
      node.position.y = y * 10 + Math.random() * 5;
      set_sector(node);
    }
  }
};

const position_randomly = () => {
  for (const node of nodes) {
    node.position.x = Math.random() * 100;
    node.position.y = Math.random() * 100;
    set_sector(node);
  }
};

const average_position = () => {
  let total = { x: 0, y: 0 };
  for (const node of nodes) {
    total = vadd(total, node.position);
  }
  const num_nodes = nodes.length;
  return vdiv(total, num_nodes);
};

const run_simulation_frame = () => {
  const average = average_position();

  for (const node of nodes) {
    let force = { x: 0, y: (node.height * 100 - node.position.y) / 100 };
    force = vadd(force, vdiv(vsub(node.position, average), -5000));
    const pos = node.position;

    for (const other of get_sector(node)) {
      let diff = vsub(pos, other.position);
      let diff_len = vlen(diff);
      if (diff_len < 1) { diff = { x: 0.3, y: 0.3 }; }
      diff_len = vlen(diff);
      let diff_unit = vdiv(diff, diff_len);
      let scale = diff_len - 100;
      force = vadd(force, vmul(diff_unit, scale / 4000));
    }

    for (const other of node.outward) {
      let diff = vsub(pos, other.position);
      let diff_len = vlen(diff);
      if (diff_len < 1) { diff = { x: 0.3, y: 0.3 }; }
      diff_len = vlen(diff);
      let diff_unit = vdiv(diff, diff_len);
      let scale = diff_len - 100;
      force = vsub(force, vmul(diff_unit, scale / 400));
    }

    for (const other of node.inward) {
      let diff = vsub(pos, other.position);
      let diff_len = vlen(diff);
      if (diff_len < 1) { diff = { x: 0.3, y: 0.3 }; }
      diff_len = vlen(diff);
      let diff_unit = vdiv(diff, diff_len);
      let scale = diff_len - 100;
      force = vsub(force, vmul(diff_unit, scale / 400));
    }

    node.force = force;
  }
  sectors = [];
  for (const node of nodes) {
    node.velocity = vadd(vmul(node.velocity, 0.95), node.force);
    node.position = vadd(node.position, node.velocity);
    set_sector(node);
  }
};

const render_at_positions = () => {
  const ctx = get_render_context();
  let min_x = 1000000;
  let max_x = -1000000;
  let min_y = 1000000;
  let max_y = -1000000;
  for (const node of nodes) {
    if (node.x < min_x) { min_x = node.x; }
    if (node.x > max_x) { max_x = node.x; }
    if (node.y < min_y) { min_y = node.y; }
    if (node.y > max_y) { max_y = node.y; }
  }
  const average = { x: min_x + (max_x - min_x) / 2, y: min_y + (max_y - min_y) / 2 };
  const scale_x = width / (max_x - min_x);
  const scale_y = height / (max_y - min_y);

  const mid_x = width / 2;
  const mid_y = height / 2;

  const x_adjust = x => (x - average.x) * scale_x * zoom.x + mid_x + pan.x;
  const y_adjust = y => (y - average.y) * scale_y * zoom.y + mid_y + pan.y;

  ctx.strokeStyle = `rgb(100, 100, 100)`;
  ctx.lineWidth = 1;
  for (const edge of edges) {
    let node = nodes[edge.source];
    let other = nodes[edge.target];
    ctx.beginPath();
    ctx.moveTo(x_adjust(node.x), y_adjust(node.y));
    ctx.lineTo(x_adjust(other.x), y_adjust(other.y));
    ctx.stroke();
  }

  for (const node of nodes) {
    ctx.fillRect(x_adjust(node.x), y_adjust(node.y), 1, 1);
  }

};

// [load_file] clears the current graph and re-populates it with the contents
// of the file currently picked by the file-picker. If nothing is picked, then
// the graph ends up empty.
const load_current_file = () => {
  const [ file ] = file_picker.files;
  nodes_by_id = {};
  if (file) {
    file.text().then(text => {
      let o = JSON.parse(text);
      nodes = o.nodes;
      edges = o.edges;
      let parser = new DOMParser();
      let xml = parser.parseFromString(text, `application/xml`);

      let num_nodes = nodes.length;
      console.log(`Loaded graph. Found ${num_nodes} nodes.`);

      //compute_heights();
      //position_near_parent();
      start_loop();
    });
  }
};

let simulation_running = false;
const start_loop = () => {
  //if (simulation_running) {
  //  run_simulation_frame();
  //}
  render_at_positions();
  requestAnimationFrame(start_loop);
};

load_current_file();
file_picker.addEventListener(`change`, load_current_file);

window.addEventListener(`wheel`, ev => {
  const x_delta = 0.001 * ev.deltaX;
  zoom.x *= 1 + x_delta;
  if (zoom.x < 1) { zoom.x = 1; }
  pan.x *= 1 + x_delta;
  pan.x -= (mouse_pos.x - width / 2) * x_delta;
  const max_pan_x = (zoom.x - 1) * (width / 2);
  if (pan.x > max_pan_x) pan.x = max_pan_x;
  if (pan.x < -max_pan_x) pan.x = -max_pan_x;

  const y_delta = 0.001 * ev.deltaY;
  zoom.y *= 1 + y_delta;
  if (zoom.y < 1) { zoom.y = 1; }
  pan.y *= 1 + y_delta;
  pan.y -= (mouse_pos.y - height / 2) * y_delta;
  const max_pan_y = (zoom.y - 1) * (height / 2);
  if (pan.y > max_pan_y) pan.y = max_pan_y;
  if (pan.y < -max_pan_y) pan.y = -max_pan_y;
  console.log(pan);

  ev.preventDefault();
});

window.addEventListener(`keydown`, ev => {
  if (ev.keyCode === 40) {
    pan.y -= 4;
  } else if (ev.keyCode === 39) {
    pan.x -= 4;
  } else if (ev.keyCode === 38) {
    pan.y += 4;
  } else if (ev.keyCode === 37) {
    pan.x += 4;
  }

});

start_simulation_button.addEventListener(`click`, () => {
  simulation_running = true;
});

stop_simulation_button.addEventListener(`click`, () => {
  simulation_running = false;
});

canvas.addEventListener(`mousemove`, ev => {
  mouse_pos = { x: ev.offsetX, y: ev.offsetY };
});
