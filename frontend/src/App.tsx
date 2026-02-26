import { Routes, Route, Link, useLocation } from 'react-router-dom';
import ReportPage from './pages/ReportPage';
import DashboardPage from './pages/DashboardPage';
import IssueDetailPage from './pages/IssueDetailPage';

function Nav() {
  const { pathname } = useLocation();
  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors duration-150 ${
      pathname === path ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'
    }`;

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-gray-900 tracking-tight text-base flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-gray-900 text-white rounded-md text-xs font-black">SS</span>
          Site Surgeon
        </Link>
        <nav className="flex items-center gap-6">
          <Link to="/" className={linkClass('/')}>Report</Link>
          <Link to="/dashboard" className={linkClass('/dashboard')}>Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
          <Routes>
            <Route path="/" element={<ReportPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/issues/:id" element={<IssueDetailPage />} />
          </Routes>
        </main>
        <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
          Site Surgeon — AI Self-Healing Web System
        </footer>
    </div>
  );
}
