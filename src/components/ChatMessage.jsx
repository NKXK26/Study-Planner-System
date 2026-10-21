// Render a small, safe subset of message formatting without HTML injection.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
export default function ChatMessage({content}) {
  const lines=String(content).split('\n');
  const blocks=[];
  for(let i=0;i<lines.length;) {
    if(!lines[i].trim()){i++;continue;}
    if(lines[i].startsWith('```')) {
      const code=[];i++;
      while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);
      i++;blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);continue;
    }
    const list=lines[i].match(/^\s*(?:([-*•])|\d+[.)])\s+(.+)/);
    if(list) {
      const ordered=!list[1],items=[];
      while(i<lines.length) {
        const match=lines[i].match(ordered?/^\s*\d+[.)]\s+(.+)/:/^\s*[-*•]\s+(.+)/);
        if(!match)break;
        items.push(<li key={items.length}>{inline(match[1])}</li>);i++;
      }
      blocks.push(ordered?<ol key={blocks.length}>{items}</ol>:<ul key={blocks.length}>{items}</ul>);continue;
    }
    const text=lines[i++].replace(/^#{1,6}\s+/, '');
    blocks.push(<p key={blocks.length}>{inline(text)}</p>);
  }
  return blocks;
}
