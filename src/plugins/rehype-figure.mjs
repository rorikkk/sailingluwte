// An image on its own line in a post becomes a <figure>, and its title (the text in quotes,
// e.g. ![](/foto.jpg "Nog even in Haarlem")) becomes the caption under it. This is how the
// posts have always looked.
export default function rehypeFigure() {
  return (tree) => walk(tree);
}

const isBlank = (n) => n.type === 'text' && !n.value.trim();

function walk(node) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type === 'element' && child.tagName === 'p') {
      const content = child.children.filter((c) => !isBlank(c));
      if (content.length === 1 && content[0].type === 'element' && content[0].tagName === 'img') {
        const img = content[0];
        const caption = img.properties.title;
        delete img.properties.title;
        const children = [img];
        if (caption) {
          children.push({
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: String(caption) }],
          });
        }
        return { type: 'element', tagName: 'figure', properties: {}, children };
      }
    }
    walk(child);
    return child;
  });
}
