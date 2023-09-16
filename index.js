const file_picker = document.getElementById(`file-picker`);
const canvas = document.getElementById(`canvas`);

// A graph is a collection of node objects keyed by an id. Each node contains a
// label and a collection of edges to or from other nodes.
let nodes = {};
let width = 200;
let height = 200;

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
  for (const node of Object.values(nodes)) {
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
  for (const node of Object.values(nodes)) {
    iter(node);
  }
};

const render_by_height = () => {
  let max_height = 0;
  for (const node of Object.values(nodes)) {
    if (node.height > max_height) {
      max_height = node.height;
    }
  }

  let by_height = [];
  for (let i = 0; i < max_height + 1; i++) {
    by_height.push([]);
  }
  for (const node of Object.values(nodes)) {
    by_height[node.height].push(node);
  }

  const ctx = get_render_context();
  for (const [x, row] of by_height.entries()) {
    for (const [y, node] of row.entries()) {
      ctx.fillRect(10 + x * 3, 10 + y * 3, 1, 1);
    }
  }
};

// [load_file] clears the current graph and re-populates it with the contents
// of the file currently picked by the file-picker. If nothing is picked, then
// the graph ends up empty.
const load_current_file = () => {
  const [ file ] = file_picker.files;
  nodes = {};
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
          outward: []
        };
        nodes[id] = x;
      }

      let edge_iterator = xml.evaluate(
        `/gexf/graph/edges/edge`, xml, null, XPathResult.ANY_TYPE, null);
      let edge;
      while ((edge = edge_iterator.iterateNext())) {
        let source = parseInt(edge.getAttribute(`source`));
        let target = parseInt(edge.getAttribute(`target`));
        nodes[source].outward.push(nodes[target]);
      }
      let num_nodes = Object.keys(nodes).length;
      console.log(`Loaded graph. Found ${num_nodes} nodes.`);

      compute_heights();
      render_by_height();

    });
  }
};

load_current_file();
file_picker.addEventListener(`change`, load_current_file);