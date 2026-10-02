const TITLES = {
  analyze: ['Analyze', 'Upload a lesion photo for classification and localization'],
  verify: ['Verify', 'Confirm low-confidence results with a second photo'],
  lesions: ['Lesions', 'Track the same lesion over time and catch meaningful changes'],
  trends: ['Trends', 'Track lesion changes across scans over time'],
  history: ['History', 'All previous scans in this session'],
  models: ['Model info', 'Architecture and performance of both models'],
  settings: ['Settings', 'Preferences for this device'],
};

export default function Topbar({ active, isDark, onToggleTheme }) {
  const [title, sub] = TITLES[active] || TITLES.analyze;
  return (
    <div
      className="flex items-center justify-between px-[26px] py-4 border-b border-[var(--line)] shrink-0"
      style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
    >
      <div>
        <h2 className="text-[18px] font-extrabold tracking-tight m-0">{title}</h2>
        <div className="text-[12px] text-[var(--muted)] mt-0.5">{sub}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTheme}
          className="w-[34px] h-[34px] rounded-full border border-[var(--line)] bg-[var(--panel)] flex items-center justify-center text-sm cursor-pointer"
          aria-label="Toggle theme"
        >
          {isDark ? '☀' : '◐'}
        </button>
        <button className="font-bold text-[13px] px-4 py-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] cursor-pointer whitespace-nowrap">
          + New scan
        </button>
      </div>
    </div>
  );
}
