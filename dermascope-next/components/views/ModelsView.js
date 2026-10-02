import { MODEL_SPECS } from '../../lib/data';

export default function ModelsView() {
  return (
    <div>
      {MODEL_SPECS.map((m) => (
        <div key={m.name} className="border border-[var(--line)] rounded-[3px] bg-[var(--panel)] p-[18px] mb-3.5">
          <div className="flex justify-between items-center mb-2.5">
            <h4 className="text-[14.5px] font-extrabold m-0">{m.name}</h4>
            <span className="font-mono text-[11px] text-[var(--teal)] bg-[var(--teal-dim)] px-2.5 py-1 rounded-full">
              {m.tag}
            </span>
          </div>
          <div className="text-[var(--muted)] text-[12.5px]">{m.desc}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
            {m.specs.map((s) => (
              <div key={s.label}>
                <div className="text-[10.5px] text-[var(--muted)] mb-0.5">{s.label}</div>
                <div className="font-mono text-[14px] font-semibold">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
