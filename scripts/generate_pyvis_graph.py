import sys
import json
import networkx as nx
from pyvis.network import Network
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--units', required=True)
    parser.add_argument('--edges', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--highlight', default='')
    args = parser.parse_args()

    with open(args.units, 'r') as f:
        units = json.load(f)
    with open(args.edges, 'r') as f:
        edges = json.load(f)

    highlight_set = set(args.highlight.split(',')) if args.highlight else set()

    G = nx.DiGraph()
    for u in units:
        name_display = u['name'][:25] + '…' if len(u['name']) > 25 else u['name']
        label = f"{u['unitCode']}\n{name_display}"
        G.add_node(
            u['unitCode'],
            title=u['name'],
            label=label,
            creditPoints=u.get('creditPoints', 0),
            color='#ff9800' if u['unitCode'] in highlight_set else '#3b82f6'
        )
    for e in edges:
        G.add_edge(e['from'], e['to'])

    net = Network(height='800px', width='100%', bgcolor='#ffffff', font_color='black')
    net.from_nx(G)

    # Override colors in PyVis nodes (to be safe)
    for node in net.nodes:
        if node['id'] in highlight_set:
            node['color'] = '#ff9800'  # orange
            node['font'] = {'color': 'black'}
        else:
            node['color'] = '#3b82f6'  # blue

    net.set_options("""
    var options = {
      "nodes": { "shape": "box", "margin": 5, "font": { "size": 11 } },
      "edges": { "arrows": { "to": { "enabled": true } } },
      "physics": { "enabled": true, "solver": "forceAtlas2Based" }
    }
    """)

    net.save_graph(args.output)
    print(json.dumps({'success': True}))

if __name__ == '__main__':
    main()