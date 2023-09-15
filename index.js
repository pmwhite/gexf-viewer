const file_picker = document.getElementById(`file-picker`);

// A graph is a collection of node objects keyed by an id. Each node contains a
// label and a collection of edges to or from other nodes.
let nodes = {};

// [load_file] clears the current graph and re-populates it with the contents
// of the file currently picked by the file-picker. If nothing is picked, then
// the graph ends up empty.
const load_current_file = () => {
  const [ file ] = file_picker.files;
  nodes = {};
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
        edges: []
      };
      nodes[id] = x;
    }

    let edge_iterator = xml.evaluate(
      `/gexf/graph/edges/edge`, xml, null, XPathResult.ANY_TYPE, null);
    let edge;
    while ((edge = edge_iterator.iterateNext())) {
      let source = parseInt(edge.getAttribute(`source`));
      let target = parseInt(edge.getAttribute(`target`));
      let x = { source: source, target: target };
      nodes[source].edges.push(x);
      nodes[target].edges.push(x);
    }
    let num_nodes = Object.keys(nodes).length;
    console.log(`Loaded graph. Found ${num_nodes} nodes.`);

  });
};

load_current_file();
file_picker.addEventListener(`change`, load_current_file);
