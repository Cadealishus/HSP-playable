import { useOS } from '../os/store';
import { HybridLogo } from '../components/ui';

export default function About() {
  const { state, actions } = useOS();
  return (
    <div className="h-full overflow-y-auto flex flex-col items-center text-center px-8 py-6" style={{ background: 'radial-gradient(70% 50% at 50% 0%, rgb(var(--acc) / .18), transparent 70%)' }}>
      <div style={{ animation: 'breathe 3s ease-in-out infinite' }}>
        <HybridLogo size={76} glow />
      </div>
      <div className="mt-4 font-display text-[24px] font-semibold tracking-[0.2em]">HYBRID OS</div>
      <div className="text-[12.5px] text-t2 mt-1">Concept 0.9 “Aurora” · interactive prototype</div>
      <div className="mt-5 w-full max-w-[380px] rounded-[14px] p-4 text-left text-[12.5px] field">
        {[
          ['Mode', state.mode === 'hybrid' ? 'HYBRID' : 'Windows'],
          ['Shell', 'React + Tailwind concept (browser)'],
          ['Target', 'Windows 11 · native shell planned'],
          ['Processor', 'Simulated 12-core · demo data'],
          ['Memory', 'Simulated 32 GB · demo data'],
          ['Graphics', 'Simulated · demo data'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between py-1">
            <span className="text-t3 font-semibold">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11.5px] text-t3 max-w-[380px] leading-relaxed">A visual blueprint for a custom Windows desktop environment. Nothing here modifies Windows or reads your files.</p>
      <button onClick={() => actions.open('settings', { props: { page: 'about' } })} className="mt-4 rounded-[10px] px-4 py-1.5 text-[12.5px] font-bold press" style={{ background: 'linear-gradient(90deg, rgb(var(--acc)), rgb(var(--acc2)))', color: 'var(--on-acc)' }}>
        System details
      </button>
    </div>
  );
}
