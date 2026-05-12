import dagre from '@dagrejs/dagre';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

export function useCanvasLayout() {
  function computeLayout(nodes, edges, direction = 'TB') {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: direction,
      nodesep: 60,
      ranksep: 100,
      marginx: 40,
      marginy: 40,
    });

    for (const node of nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const layoutedNodes = nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      };
    });

    return layoutedNodes;
  }

  return { computeLayout, NODE_WIDTH, NODE_HEIGHT };
}
