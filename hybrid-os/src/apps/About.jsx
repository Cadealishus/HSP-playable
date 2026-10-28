import { useOS } from '../os/store';
import { HybridLogo, Button } from '../components/ui';

export default function About() {
  const { state, actions } = useOS();
  return (
    <div className="h-full overflow-y-auto flex flex-col items-center text-center px-8 py-8">
      <HybridLogo size={64} />
      <div className="mt-4 text-[20px] font-semibold tracking-[0.04em]">HYBRID OS</div>
      <div className="text-[13px] text-t2 mt-1">Concept 0.9 · Interactive prototype</div>
      <dl className="mt-6 w-full max-w-[380px] text-left text-[13px]">
        {[
          ['Desktop', state.mode === 'hybrid' ? 'HYBRID' : 'Windows'],
          ['Runs in', 'Web browser (React)'],
          ['Target', 'Windows 11, native shell planned'],
          ['Hardware data', 'Simulated'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between h-9 items-center" style={{ borderBottom: '1px solid var(--line)' }}>
            <dt className="text-t2">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[12px] text-t3 max-w-[380px] leading-[1.5]">A design blueprint for a Windows desktop environment. Nothing here changes Windows settings or reads your files.</p>
      <Button className="mt-5" onClick={() => actions.open('settings', { props: { page: 'about' } })}>
        Open in Settings
      </Button>
    </div>
  );
}
