import React, { useState } from 'react';
import { OperatorForm } from './components/OperatorForm';
import { ManagerDashboard } from './components/ManagerDashboard';
import { AdminPanel } from './components/AdminPanel';
import { LoginScreen } from './components/LoginScreen';
import { User, UserRole } from './types';
import { HardHat, BarChart3, Settings, LogOut, Menu } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'operator' | 'manager' | 'admin'>('operator');

  // If not logged in, show login screen
  if (!user) {
    return <LoginScreen onLogin={(loggedInUser) => {
      setUser(loggedInUser);
      // Set default tab based on role
      setActiveTab(loggedInUser.role === 'admin' ? 'manager' : 'operator');
    }} />;
  }

  const handleLogout = () => {
    setUser(null);
    setActiveTab('operator');
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 pb-20 md:pb-0">
      
      {/* Navbar Desktop */}
      <nav className="bg-slate-900 text-white shadow-lg sticky top-0 z-50 border-b-4 border-amber-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className={`${user.role === 'admin' ? 'bg-orange-600' : 'bg-amber-500'} p-2 rounded-lg`}>
                {user.role === 'admin' ? <Settings className="w-5 h-5 text-white" /> : <HardHat className="w-5 h-5 text-white" />}
              </div>
              <div>
                <span className="block font-black text-lg tracking-tight leading-none italic">TopSafe</span>
                <span className="text-xs text-slate-400 font-normal">
                  Hola, {user.name}
                </span>
              </div>
            </div>
            
            {/* Desktop Tabs */}
            <div className="hidden md:flex items-center space-x-2">
              {user.role === 'operator' && (
                <button
                  onClick={() => setActiveTab('operator')}
                  className="px-4 py-2 rounded-md text-sm font-bold bg-amber-500 text-slate-900 hover:bg-amber-400"
                >
                  PANEL OPERARIO
                </button>
              )}

              {user.role === 'admin' && (
                <>
                  <button
                    onClick={() => setActiveTab('manager')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === 'manager' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => setActiveTab('operator')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === 'operator' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Vista Operario (Test)
                  </button>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === 'admin' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Configuración
                  </button>
                </>
              )}

              <div className="h-6 w-px bg-slate-700 mx-2"></div>
              
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium px-2"
              >
                <LogOut className="w-4 h-4" /> Salir
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {activeTab === 'operator' && <OperatorForm />}
        {/* Security Check: Only admins can render manager/admin components */}
        {user.role === 'admin' && activeTab === 'manager' && <ManagerDashboard />}
        {user.role === 'admin' && activeTab === 'admin' && <AdminPanel />}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-3 z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        
        {user.role === 'operator' ? (
          <div className="flex justify-between w-full px-8 items-center">
            <span className="text-sm font-bold text-slate-700">{user.name}</span>
            <button 
              onClick={handleLogout}
              className="flex flex-col items-center gap-1 text-red-500"
            >
              <LogOut className="w-6 h-6" />
              <span className="text-xs font-medium">Salir</span>
            </button>
          </div>
        ) : (
          <>
            <button 
              onClick={() => setActiveTab('manager')}
              className={`flex flex-col items-center gap-1 ${activeTab === 'manager' ? 'text-orange-600' : 'text-slate-400'}`}
            >
              <BarChart3 className="w-6 h-6" />
              <span className="text-xs font-medium">Dash</span>
            </button>
            <button 
              onClick={() => setActiveTab('operator')}
              className={`flex flex-col items-center gap-1 ${activeTab === 'operator' ? 'text-orange-600' : 'text-slate-400'}`}
            >
              <HardHat className="w-6 h-6" />
              <span className="text-xs font-medium">Op</span>
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-orange-600' : 'text-slate-400'}`}
            >
              <Settings className="w-6 h-6" />
              <span className="text-xs font-medium">Config</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex flex-col items-center gap-1 text-slate-400 hover:text-red-500"
            >
              <LogOut className="w-6 h-6" />
              <span className="text-xs font-medium">Salir</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default App;