import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Manager from './pages/Manager';
import SubManager from './pages/SubManager';
import Collector from './pages/Collector';
import Annotator from './pages/Annotator';
import Reviewer from './pages/Reviewer';
import Inspector from './pages/Inspector';
import QualityReviewer from './pages/QualityReviewer';
import SuperAdmin from './pages/SuperAdmin';
import Terms from './pages/Terms';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/terms/:type" element={<Terms />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/sub-manager" element={<SubManager />} />
        <Route path="/collector" element={<Collector />} />
        <Route path="/annotator" element={<Annotator />} />
        <Route path="/reviewer" element={<Reviewer />} />
        <Route path="/inspector" element={<Inspector />} />
        <Route path="/quality-reviewer" element={<QualityReviewer />} />
        <Route path="/super-admin" element={<SuperAdmin />} />
      </Routes>
    </Router>
  );
}

export default App;
