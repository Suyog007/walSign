import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { UploadPage } from './pages/UploadPage';
import { SignPage } from './pages/SignPage';
import { VerifyPage } from './pages/VerifyPage';
import ProfilePage from './pages/ProfilePage';
import { ViewBlobPage } from './pages/ViewBlobPage';
import { useAutoConnectWallet } from './hooks/useAutoConnectWallet';
import { WalletAutoConnect } from './components/WalletAutoConnect';

export default function App() {
  // Auto-connect wallet on app load if previously connected
  useAutoConnectWallet();

  return (
    <div className="min-h-screen relative">
      {/* Animated Background Shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-72 h-72 bg-purple-800 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-purple-700 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-purple-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/sign/:documentId" element={<SignPage />} />
            <Route path="/sign" element={<SignPage />} />
            <Route path="/verify/:documentId" element={<VerifyPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/view-blob" element={<ViewBlobPage />} />
          </Routes>
        </div>
        <WalletAutoConnect />
      </div>
    </div>
  );
}

