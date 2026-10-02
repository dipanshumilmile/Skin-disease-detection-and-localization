'use client';
import { useState } from 'react';

function SettingRow({ label, desc, right }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-[var(--line)] max-w-[560px]">
      <div>
        <div className="text-[13.5px] font-semibold">{label}</div>
        <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{desc}</div>
      </div>
      {right}
    </div>
  );
}

export default function SettingsView({ isDark, onToggleTheme }) {
  const [warnings, setWarnings] = useState(true);
  const [storeHistory, setStoreHistory] = useState(true);
  const [threshold, setThreshold] = useState(60);

  return (
    <div>
      <SettingRow
        label="Dark mode"
        desc="Switch the interface theme"
        right={<div className={`toggle ${isDark ? 'on' : ''}`} onClick={onToggleTheme} />}
      />
      <SettingRow
        label="Low-confidence warnings"
        desc="Flag predictions below the threshold"
        right={<div className={`toggle ${warnings ? 'on' : ''}`} onClick={() => setWarnings(!warnings)} />}
      />
      <SettingRow
        label="Confidence threshold"
        desc={`${threshold}%`}
        right={
          <input
            type="range"
            min="0"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-[220px] accent-[var(--teal)]"
          />
        }
      />
      <SettingRow
        label="Store scan history locally"
        desc="Kept on this device only, never uploaded"
        right={<div className={`toggle ${storeHistory ? 'on' : ''}`} onClick={() => setStoreHistory(!storeHistory)} />}
      />
    </div>
  );
}
