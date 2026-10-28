import { useState, useEffect } from 'react';
import { Files, Search, GitBranch, Bug, Puzzle, ChevronDown, ChevronRight, X, Settings, CircleDot } from 'lucide-react';
import { PROJECTS, CODE, nodeAt } from '../os/data';
import { fileIcon } from '../os/search';

const KW = /\b(import|from|export|const|let|var|function|return|for|if|else|new|public|private|sealed|class|record|namespace|using|get|set|init|foreach|in|var|double|float|int|vec3|vec4|uniform|varying|void|string|readonly|static|this|true|false|null)\b/;
const TYPES = /\b(Vector3|Math|Dictionary|Intent|RockyBrain|DockMagnifier|IShellBridge|Hybrid|Rocky|Shell)\b/;

// Small hand-rolled highlighter: comments, strings, numbers, keywords, types, calls
function highlight(line) {
  const out = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b\d[\d._e+-]*\b)|([A-Za-z_][\w]*)(?=\s*\()|([A-Za-z_][\w]*)|(\s+)|(.)/g;
  let m;
  let k = 0;
  while ((m = re.exec(line))) {
    const [t, com, str, num, call, word, ws, ch] = m;
    let c = '#d4dcf5';
    if (com) c = '#6a7799';
    else if (str) c = '#9ee6a8';
    else if (num) c = '#ffb56b';
    else if (call) c = KW.test(call) ? '#c792ea' : '#5ec8ff';
    else if (word) c = KW.test(word) ? '#c792ea' : TYPES.test(word) ? '#ffd76b' : '#d4dcf5';
    else if (ch) c = '#9aa6c8';
    out.push(
      <span key={k++} style={{ color: c, fontStyle: com ? 'italic' : undefined }}>
        {t}
      </span>
    );
  }
  return out;
}

export default function Code({ project = 'hybrid', file, fileName, nonce }) {
  const proj = PROJECTS.find((p) => p.id === project) || PROJECTS[1];
  const tree = nodeAt(proj.path);
  const [open, setOpen] = useState(() => [fileName || proj.file]);
  const [active, setActive] = useState(fileName || proj.file);
  const [expanded, setExpanded] = useState({ src: true, parts: false });
  useEffect(() => {
    if (fileName) {
      setOpen((o) => (o.includes(fileName) ? o : [...o, fileName]));
      setActive(fileName);
    }
  }, [nonce]);
  const src = CODE[active] || `// ${active}\n// Preview not available in the concept build.\n// Open orbit.js, DockMagnifier.cs, RockyBrain.cs or terrain.glsl for a sample.`;
  const lines = src.split('\n');

  const openFile = (n) => {
    setOpen((o) => (o.includes(n) ? o : [...o, n]));
    setActive(n);
  };

  const Tree = ({ node, depth = 0 }) =>
    node.children.map((c) => {
      const I = fileIcon(c.name, c.type === 'folder');
      if (c.type === 'folder')
        return (
          <div key={c.name}>
            <button onClick={() => setExpanded((e) => ({ ...e, [c.name]: !e[c.name] }))} className="w-full flex items-center gap-1 py-[3px] text-left hover:bg-white/5" style={{ paddingLeft: 8 + depth * 12 }}>
              {expanded[c.name] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="truncate">{c.name}</span>
            </button>
            {expanded[c.name] && <Tree node={c} depth={depth + 1} />}
          </div>
        );
      return (
        <button key={c.name} onClick={() => openFile(c.name)} className="w-full flex items-center gap-1.5 py-[3px] text-left hover:bg-white/5" style={{ paddingLeft: 22 + depth * 12, background: active === c.name ? 'rgba(94,200,255,.14)' : undefined }}>
          <I size={13} className="text-[#5ec8ff] shrink-0" />
          <span className="truncate">{c.name}</span>
        </button>
      );
    });

  return (
    <div className="h-full flex flex-col text-[13px] text-[#c9d3ee]" style={{ background: '#0d1022' }}>
      <div className="flex-1 min-h-0 flex">
        <div className="w-[46px] shrink-0 flex flex-col items-center gap-4 pt-3" style={{ background: '#090b18' }} aria-hidden="true">
          {[Files, Search, GitBranch, Bug, Puzzle].map((I, i) => (
            <I key={i} size={20} strokeWidth={1.6} className={i === 0 ? 'text-white' : 'text-[#5d6789]'} />
          ))}
          <Settings size={19} strokeWidth={1.6} className="text-[#5d6789] mt-auto mb-3" />
        </div>
        <div className="w-[200px] shrink-0 overflow-y-auto" style={{ background: '#0b0e1d', borderRight: '1px solid rgba(255,255,255,.05)' }}>
          <div className="px-3 py-2 text-[11px] font-semibold text-[#7d88ad]">Explorer</div>
          <div className="px-2 py-1 font-semibold text-[11px] flex items-center gap-1">
            <ChevronDown size={13} /> {proj.name}
          </div>
          {tree && <Tree node={tree} />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex h-[36px] shrink-0 overflow-x-auto" style={{ background: '#0a0d1b' }}>
            {open.map((n) => {
              const I = fileIcon(n);
              return (
                <div key={n} onClick={() => setActive(n)} className="flex items-center gap-2 px-3 cursor-pointer shrink-0 text-[12px]" style={{ background: active === n ? '#0d1022' : 'transparent', borderTop: active === n ? '2px solid #5ec8ff' : '2px solid transparent', color: active === n ? '#fff' : '#7d88ad' }}>
                  <I size={13} className="text-[#5ec8ff]" />
                  {n}
                  <button
                    aria-label={`Close ${n}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rest = open.filter((x) => x !== n);
                      setOpen(rest.length ? rest : [proj.file]);
                      if (active === n) setActive(rest[0] || proj.file);
                    }}
                    className="w-4 h-4 grid place-items-center rounded hover:bg-white/10"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-1 text-[11px] text-[#6a7499] shrink-0">
            {proj.name} › {active}
          </div>
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className="flex-1 overflow-auto font-mono text-[13px] leading-[1.65] py-1 selectable">
              {lines.map((l, i) => (
                <div key={i} className="flex hover:bg-white/[.03]">
                  <span className="w-12 shrink-0 text-right pr-4 text-[#454e72] select-none">{i + 1}</span>
                  <span className="whitespace-pre">{highlight(l)}</span>
                </div>
              ))}
            </div>
            {/* minimap */}
            <div className="w-[70px] shrink-0 py-2 px-2 opacity-60" style={{ borderLeft: '1px solid rgba(255,255,255,.04)' }}>
              {lines.map((l, i) => (
                <div key={i} className="h-[3px] mb-[1px] rounded-sm" style={{ width: `${Math.min(100, l.length * 1.4)}%`, marginLeft: `${(l.length - l.trimStart().length) * 2}%`, background: l.trim().startsWith('//') ? '#4a5578' : '#7d88c8' }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="h-[24px] shrink-0 flex items-center gap-4 px-3 text-[11px] text-white" style={{ background: 'linear-gradient(90deg, #1a5fd0, #6b3fd8)' }}>
        <span className="flex items-center gap-1">
          <GitBranch size={12} /> {proj.branch}
        </span>
        <span className="flex items-center gap-1">
          <CircleDot size={11} /> 0 problems
        </span>
        <span className="ml-auto">Ln {Math.min(12, lines.length)}, Col 5</span>
        <span>Spaces: 4</span>
        <span>{proj.lang.split(' · ')[0]}</span>
      </div>
    </div>
  );
}
