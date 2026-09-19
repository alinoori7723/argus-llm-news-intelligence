import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import IntelligenceWorkspace from './pages/IntelligenceWorkspace';
import Dashboard from './pages/Dashboard';
import NarrativeStream from './pages/NarrativeStream';
import NewsTimeline from './pages/NewsTimeline';
import MorningBrief from './pages/MorningBrief';
import WorldRadar from './pages/WorldRadar';
import NewsRoom from './pages/NewsRoom';
import SourceRegistry from './pages/SourceRegistry';
import Ingestion from './pages/Ingestion';
import Calendar from './pages/Calendar';
import Clusters from './pages/Clusters';

const navItems = [
  { to: '/', label: 'Intelligence', end: true },
  { to: '/radar', label: 'Dashboard', end: true },
  { to: '/narrative', label: 'Narrative Stream' },
  { to: '/timeline', label: 'News Timeline' },
  { to: '/brief', label: 'Morning Brief' },
  { to: '/world', label: 'World Radar' },
  { to: '/newsroom', label: 'News Room' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/clusters', label: 'Clusters' },
  { to: '/sources', label: 'Source Registry' },
  { to: '/ingestion', label: 'Ingestion' },
];

export default function App() {
  const location = useLocation();
  if (['/', '/lineage', '/audit', '/runtime'].includes(location.pathname))
    return <IntelligenceWorkspace />;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-700 bg-ink-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6 flex-wrap">
          <div className="font-mono text-sm tracking-widest text-ink-100">ARGUS · News Radar</div>
          <nav aria-label="Primary" className="flex gap-1 flex-wrap">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider',
                    isActive
                      ? 'bg-ink-700 text-ink-50'
                      : 'text-ink-400 hover:text-ink-100 hover:bg-ink-700/50',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/radar" element={<Dashboard />} />
          <Route path="/narrative" element={<NarrativeStream />} />
          <Route path="/timeline" element={<NewsTimeline />} />
          <Route path="/brief" element={<MorningBrief />} />
          <Route path="/world" element={<WorldRadar />} />
          <Route path="/newsroom" element={<NewsRoom />} />
          <Route path="/newsroom/:itemId" element={<NewsRoom />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/clusters" element={<Clusters />} />
          <Route path="/sources" element={<SourceRegistry />} />
          <Route path="/ingestion" element={<Ingestion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-ink-700 bg-ink-800/60 text-ink-500 text-xs font-mono px-4 py-2">
        Recorded fixtures · source-backed observations · deterministic priority
      </footer>
    </div>
  );
}
