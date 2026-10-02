const NAV_ITEMS = [
  { key: 'analyze', label: 'Analyze' },
  { key: 'verify', label: 'Verify' },
  { key: 'lesions', label: 'Lesions' },
  { key: 'trends', label: 'Trends' },
  { key: 'history', label: 'History' },
  { key: 'models', label: 'Model info' },
  { key: 'settings', label: 'Settings' },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <div
      className="w-[220px] shrink-0 flex flex-col px-3.5 py-[18px] text-[#cfe0da]"
      style={{
        background: 'var(--sidebar)',
        paddingTop: 'calc(18px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-center gap-2.5 px-2 pb-5 mb-3.5 border-b border-white/10">
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--teal)]" />
        <h1 className="text-[16px] font-extrabold text-white m-0">DermaScope</h1>
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = active === item.key;
        return (
          <div
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-[13.5px] cursor-pointer mb-0.5 ${
              isActive
                ? 'bg-[rgba(63,184,176,0.16)] text-[#6fd4cb] font-bold'
                : 'text-[#9fb3ac] hover:bg-white/5 hover:text-[#e9efec]'
            }`}
          >
            <span
              className="w-[5px] h-[5px] rounded-full"
              style={{ background: 'currentColor', opacity: isActive ? 1 : 0 }}
            />
            {item.label}
          </div>
        );
      })}

      <div className="mt-auto pt-2.5 px-2 border-t border-white/10 text-[11.5px] text-[#6f8a81]">
        Major Project · Dept. of CSE
        <br />
        RCOEM, Nagpur — 2026-27
      </div>
    </div>
  );
}
