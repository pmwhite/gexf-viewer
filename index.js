const file_picker = document.getElementById(`file-picker`);
const canvas = document.getElementById(`canvas`);

// A graph is a collection of node objects keyed by an id. Each node contains a
// label and a collection of edges to or from other nodes.
let nodes_by_id = {};
let nodes = [];
let sectors = [];
let sector_size = 200;

let width = 200;
let height = 200;

let scale = 0.003;

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
      for (const other of node.outward) {
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
  const x_sector = Math.floor(node.position_x / sector_size);
  const y_sector = Math.floor(node.position_y / sector_size);
  return sectors[x_sector][y_sector];
};

const set_sector = node => {
  const x_sector = Math.floor(node.position_x / sector_size);
  const y_sector = Math.floor(node.position_y / sector_size);
  if (!sectors[x_sector]) { sectors[x_sector] = []; }
  if (!sectors[x_sector][y_sector]) { sectors[x_sector][y_sector] = []; }
  sectors[x_sector][y_sector].push(node);
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
      node.position_x = x * 10 + Math.random() * 5;
      node.position_y = y * 10 + Math.random() * 5;
      set_sector(node);
    }
  }
};

const position_randomly = () => {
  for (const node of nodes) {
    node.position_x = Math.random() * 1000000;
    node.position_y = Math.random() * 1000000;
    set_sector(node);
  }
};

const run_simulation_frame = () => {
  for (const node of nodes) {
    node.force_x = 0;
    node.force_y = 0;
  }
  for (const node of nodes) {
    let x_force = 0;
    let y_force = 0;

    let x = node.position_x;
    let y = node.position_y;

    for (const other of get_sector(node)) {
      if (node !== other) {
        let x_diff = (x - other.position_x);
        let y_diff = (y - other.position_y);
        if (x_diff < 1) { x_diff = 1; }
        if (y_diff < 1) { y_diff = 1; }
        x_force += 100 / (x_diff * x_diff);
        y_force += 100 / (y_diff * y_diff);
      }
    }

    for (const other of node.outward) {
      let x_diff = (x - other.position_x);
      let y_diff = (y - other.position_y);
      x_force -= x_diff / 200;
      y_force -= y_diff / 200;

    }

    for (const other of node.inward) {
      let x_diff = (x - other.position_x);
      let y_diff = (y - other.position_y);
      x_force -= x_diff / 100;
      y_force -= y_diff / 100;
    }

    node.force_x += x_force;
    node.force_y += y_force;
  }
  sectors = [];
  let i = 0;
  for (const node of nodes) {
    node.velocity_x += node.force_x - 0.3 * node.velocity_x;
    node.velocity_y += node.force_y - 0.3 * node.velocity_y;
    node.position_x += node.velocity_x;
    node.position_y += node.velocity_y;
    set_sector(node);
    i += 1;
  }
};

const render_at_positions = () => {
  const ctx = get_render_context();
  let total_x = 0;
  let total_y = 0;
  for (const node of nodes) {
    total_x += node.position_x;
    total_y += node.position_y;
  }
  const num_nodes = nodes.length;
  const average_x = total_x / num_nodes;
  const average_y = total_y / num_nodes;

  const mid_x = width / 2;
  const mid_y = height / 2;

  ctx.strokeStyle = `rgb(100, 100, 100)`;
  ctx.lineWidth = 1;
  for (const node of nodes) {
    for (const other of node.outward) {
      ctx.beginPath();
      ctx.moveTo((node.position_x - average_x) * scale + mid_x, (node.position_y - average_y) * scale + mid_y);
      ctx.lineTo((other.position_x - average_x) * scale + mid_x, (other.position_y - average_y) * scale + mid_y);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = `rgb(255, 255, 255)`;
  for (const node of nodes) {
    const x = node.position_x - average_x;
    const y = node.position_y - average_y;
    ctx.fillRect(x * scale + mid_x, y * scale + mid_y, 1, 1);
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
      let parser = new DOMParser();
      let xml = parser.parseFromString(text, `application/xml`);

      let node_iterator = xml.evaluate(
        `/gexf/graph/nodes/node`, xml, null, XPathResult.ANY_TYPE, null);
      let node;
      while ((node = node_iterator.iterateNext())) {
        let id = parseInt(node.getAttribute(`id`));
        let x = {
          id: id,
          label: node.getAttribute(`label`),
          outward: [],
          inward: [],
          velocity_x: 0,
          velocity_y: 0
        };
        nodes_by_id[id] = x;
      }
      nodes = Object.values(nodes_by_id);

      let edge_iterator = xml.evaluate(
        `/gexf/graph/edges/edge`, xml, null, XPathResult.ANY_TYPE, null);
      let edge;
      while ((edge = edge_iterator.iterateNext())) {
        let source = parseInt(edge.getAttribute(`source`));
        let target = parseInt(edge.getAttribute(`target`));
        nodes_by_id[source].outward.push(nodes_by_id[target]);
        nodes_by_id[target].inward.push(nodes_by_id[source]);
      }
      let num_nodes = Object.keys(nodes_by_id).length;
      console.log(`Loaded graph. Found ${num_nodes} nodes.`);

      compute_heights();
      position_randomly();
      start_loop();
    });
  }
};

const start_loop = () => {
  run_simulation_frame();
  run_simulation_frame();
  run_simulation_frame();
  render_at_positions();
  requestAnimationFrame(start_loop);
};

load_current_file();
file_picker.addEventListener(`change`, load_current_file);
