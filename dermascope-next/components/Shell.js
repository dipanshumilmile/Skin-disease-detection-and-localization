'use client';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AnalyzeView from './views/AnalyzeView';
import VerifyView from './views/VerifyView';
import LesionsView from './views/LesionsView';
import TrendsView from './views/TrendsView';
import HistoryView from './views/HistoryView';
import ModelsView from './views/ModelsView';
import SettingsView from './views/SettingsView';

const VIEWS = {
  analyze: AnalyzeView,
  verify: VerifyView,
  lesions: LesionsView,
  trends: TrendsView,
  history: HistoryView,
  models: ModelsView,
  settings: SettingsView,
};

export default function Shell() {
  const [activeView, setActiveView] = useState('analyze');
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => setIsDark((d) => !d);

  const ActiveComponent = VIEWS[activeView];

  return (
    <div
      data-theme={isDark ? 'dark' : 'light'}
      className="flex h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]"
    >
      <Sidebar active={activeView} onNavigate={setActiveView} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Topbar active={activeView} isDark={isDark} onToggleTheme={toggleTheme} />
        <div
          className="flex-1 overflow-y-auto px-[26px] pt-6 pb-[50px]"
          style={{ paddingBottom: 'calc(50px + env(safe-area-inset-bottom, 0px))' }}
        >
          {activeView === 'settings' ? (
            <SettingsView isDark={isDark} onToggleTheme={toggleTheme} />
          ) : (
            <ActiveComponent />
          )}
        </div>
      </div>
    </div>
  );
}
