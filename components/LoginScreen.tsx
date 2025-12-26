import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { getOperators } from '../services/dataService';
import { ShieldCheck, HardHat, ArrowRight, Lock, Loader2 } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<UserRole | null>(null);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
    
  // Async State
  const [operators, setOperators] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === 'operator') {
      setLoading(true);
      getOperators().then(data => {
        setOperators(data);
        setLoading(false);
      });
    }
  }, [mode]);

  const handleOperatorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOperator) {
      onLogin({ name: selectedOperator, role: 'operator' });
    }
  };

  // --- AQUÍ ESTABA EL ERROR, LO HEMOS CORREGIDO A MODO LOCAL ---
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulación de carga para que parezca profesional
    setTimeout(() => {
      // CONTRASEÑA MAESTRA LOCAL (Sin internet)
      if (password === "admin.987") {
        onLogin({ name: 'Gerente Planta', role: 'admin' });
      } else {
        setError('Contraseña incorrecta');
        setLoading(false);
      }
    }, 800); 
  };
  // ------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border-t-4 border-amber-500">
        
        {/* Header Branding */}
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500"></div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white uppercase italic">
            Producción <span className="text-amber-500">TopSafe</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium">App Producción</p>
        </div>

        <div className="p-8">
          {!mode ? (
            <div className="space-y-4">
              <p className="text-center text-slate-600 mb-6 font-medium">Seleccione su perfil:</p>
              
              <button 
                onClick={() => setMode('operator')}
                className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:bg-amber-50 hover:border-amber-300 transition-all group"
              >
                <div className="bg-amber-100 p-3 rounded-full group-hover:bg-amber-500 transition-colors">
                  <HardHat className="w-6 h-6 text-amber-600 group-hover:text-white" />
                </div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">Soy Operario</span>
                  <span className="text-xs text-slate-500">Registrar producción</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-amber-600" />
              </button>

              <button 
                onClick={() => setMode('admin')}
                className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:bg-orange-50 hover:border-orange-300 transition-all group"
              >
                <div className="bg-orange-100 p-3 rounded-full group-hover:bg-orange-600 transition-colors">
                  <ShieldCheck className="w-6 h-6 text-orange-600 group-hover:text-white" />
                </div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">Soy Gerencia</span>
                  <span className="text-xs text-slate-500">Control y Análisis</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-orange-600" />
              </button>
            </div>
          ) : mode === 'operator' ? (
            <form onSubmit={handleOperatorLogin} className="space-y-6 animate-in slide-in-from-right duration-300">
              <div className="text-center">
                <div className="inline-block p-3 bg-amber-100 rounded-full mb-3">
                  <HardHat className="w-8 h-8 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Acceso Operario</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Identificación</label>
                {loading ? (
                   <div className="flex justify-center p-4">
                     <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                   </div>
                ) : (
                  <select 
                    className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500"
                    value={selectedOperator}
                    onChange={(e) => setSelectedOperator(e.target.value)}
                    required
                  >
                    <option value="">-- Seleccionar Nombre --</option>
                    {operators.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                )}
              </div>

              <button disabled={loading} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg transition-colors shadow-md shadow-amber-200 disabled:opacity-50">
                INGRESAR A PLANTA
              </button>
              
              <button 
                type="button" 
                onClick={() => setMode(null)} 
                className="w-full text-slate-500 text-sm hover:text-slate-800 mt-4"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-6 animate-in slide-in-from-right duration-300">
              <div className="text-center">
                <div className="inline-block p-3 bg-orange-100 rounded-full mb-3">
                  <Lock className="w-8 h-8 text-orange-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Acceso Gerencia</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Clave de Acceso</label>
                <input 
                  type="password"
                  className="w-full p-3 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  disabled={loading}
                />
                {error && <p className="text-red-500 text-xs mt-2 font-bold">{error}</p>}
              </div>

              <button 
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md shadow-orange-200 flex justify-center items-center disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ACCEDER AL DASHBOARD"}
              </button>
              
              <button 
                type="button" 
                onClick={() => setMode(null)} 
                className="w-full text-slate-500 text-sm hover:text-slate-800 mt-4"
              >
                Cancelar
              </button>
            </form>
          )}
        </div>
      </div>
      
      <div className="fixed bottom-4 text-center w-full px-4">
        <p className="text-slate-400 text-xs font-semibold">
          Producción TopSafe v1.5
        </p>
        <p className="text-slate-500 text-xs mt-1">
          Desarrollado por <span className="font-bold text-amber-600">Alegre Sebastian</span>
        </p>
      </div>
    </div>
  );
};
