import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import Kanban from './views/Kanban';
import Inbox from './views/Inbox';

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <span className="nav-brand">Skipper</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/inbox"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Inbox
        </NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sprints/:id" element={<Kanban />} />
          <Route path="/inbox" element={<Inbox />} />
        </Routes>
      </main>
    </div>
  );
}
