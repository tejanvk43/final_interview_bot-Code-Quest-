import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.tsx';
import Interview from './pages/Interview.tsx';
import AdminLogin from './pages/AdminLogin.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import InterviewReport from './pages/InterviewReport.tsx';
import Completed from './pages/Completed.tsx';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/interview/:interviewId" element={<Interview />} />
        <Route path="/completed" element={<Completed />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/report/:interviewId" element={<InterviewReport />} />
      </Routes>
    </Router>
  );
}

export default App;
