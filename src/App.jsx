import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import BarangayList from './pages/BarangayList';
import AddResident from './pages/AddResident';
import Reports from './pages/Reports';
import ManageAccounts from './pages/ManageAccounts';
import ArchiveResidents from './pages/ArchiveResidents';
import UploadData from './pages/UploadData';
import ForcePasswordChange from './pages/ForcePasswordChange';
import ProtectedRoute from './ProtectedRoutes/ProtectedRoute';
import { FeedbackProvider } from './context/FeedbackContext';
import { SessionProvider } from './context/SessionContext';
import './css/global.css';

// Hoisted so the arrays keep a stable identity. Passing inline literals made
// ProtectedRoute's effect re-run on every render, re-issuing getSession() and
// re-subscribing to auth each time.
const ADMIN_ROLES = ['Admin', 'Administrator'];
const UPLOAD_ROLES = ['Admin', 'Administrator', 'Staff'];

function App() {
  return (
    <FeedbackProvider>
      <Router>
        <SessionProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/force-password-change" element={<ForcePasswordChange />} />

            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>} />
            <Route path="/barangay" element={<ProtectedRoute><BarangayList /></ProtectedRoute>} />
            <Route path="/add-resident" element={<ProtectedRoute><AddResident /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/manage-accounts" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><ManageAccounts /></ProtectedRoute>} />
            <Route path="/archive" element={<ProtectedRoute><ArchiveResidents /></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute allowedRoles={UPLOAD_ROLES}><UploadData /></ProtectedRoute>} />
          </Routes>
        </SessionProvider>
      </Router>
    </FeedbackProvider>
  ); 
}

export default App;
