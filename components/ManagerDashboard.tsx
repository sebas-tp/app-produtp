import React, { useState, useEffect } from 'react';
import { getProductionLogs, getOperators } from '../services/dataService';
import { ProductionLog } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { Activity, Users, TrendingUp, Box, BrainCircuit, X, Loader2, FileText, Lock, ShieldCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { analyzeProductionData } from '../services/aiService';

export const Dashboard: React.FC = () => {
  // --- ESTADOS DE DATOS ---
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<string[]>([]);
  
  // --- ESTADOS DE FILTRO ---
  const [dateRange, setDateRange] = useState('today');
  const [selectedOperator, setSelectedOperator] = useState('all');

  // --- ESTADOS DE IA Y PDF ---
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // --- ESTADOS DE SEGURIDAD (CANDADO) ---
  const [isAuthorized, setIsAuthorized] = useState(false); // ¿Ya puso la clave?
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'ai' | 'pdf' | null>(null);

  // CLAVE MAESTRA (¡Cámbiala aquí por la que quieras!)
  const MASTER_PASSWORD = "Ing.2026"; 

  useEffect(() => { loadData(); }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const allLogs = await getProductionLogs(); 
      const ops = await getOperators();
      
      const now = new Date();
      let filtered = allLogs;
      
      if (dateRange === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        filtered = allLogs.filter(l => l.date.startsWith(todayStr));
      } 
      setLogs(filtered);
      setOperators(ops);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const displayLogs = selectedOperator === 'all' 
    ? logs 
    : logs.filter(l => l.operator === selectedOperator);

  // --- CÁLCULOS KPI ---
  const totalPoints = displayLogs.reduce((acc, curr) => acc + curr.points, 0);
  const totalUnits = displayLogs.reduce((acc, curr) => acc + curr.quantity, 0);
  const activeOperators = new Set(displayLogs.map(l => l.operator)).size;
  const averageEfficiency = activeOperators ? Math.round((totalPoints / activeOperators / 800) * 100) : 0;

  // --- DATOS GRÁFICOS ---
  const modelData = Object.entries(displayLogs.reduce((acc: any, curr) => {
    acc[curr.model] = (acc[curr.model] || 0) + curr.quantity;
    return acc;
  }, {})).map(([name, value]) => ({ name, value })).sort((a: any, b: any) => b.value - a.value).slice(0, 5);

  const sectorData = Object.entries(displayLogs.reduce((acc: any, curr) => {
    acc[curr.sector] = (acc[curr.sector] || 0) + curr.points;
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));

  const COLORS = ['#ea580c', '#0ea5e9', '#22c55e', '#eab308', '#8b5cf6'];

  // --- SISTEMA DE SEGURIDAD ---
  const requestAccess = (action: 'ai' | 'pdf') => {
    if (isAuthorized) {
      // Si ya está autorizado, ejecutamos directo
      if (action === 'ai') executeAnalysis();
      if (action === 'pdf') executeExportPDF();
    } else {
      // Si no, pedimos clave
      setPendingAction(action);
      setShowAuthModal(true);
    }
  };

  const verifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === MASTER_PASSWORD) {
      setIsAuthorized(true); // ¡Desbloqueado para esta sesión!
      setShowAuthModal(false);
      setPasswordInput('');
      
      // Ejecutar lo que quería hacer
      if (pendingAction === 'ai') executeAnalysis();
      if (pendingAction === 'pdf') executeExportPDF();
    } else {
      alert("⚠️ Contraseña incorrecta. Acceso denegado a Ingeniería.");
    }
  };

  // --- LÓGICA DE ACCIONES ---
  const executeAnalysis = async () => {
    setAnalyzing(true);
    setShowAnalysisModal(true);
    try {
      const result = await analyzeProductionData(displayLogs, operators, totalPoints);
      setAnalysisResult(result);
    } catch (error) {
      setAnalysisResult("Error de conexión con IA.");
    } finally {
      setAnalyzing(false);
    }
  };

  const executeExportPDF = () => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString();
    
    // Título
    doc.setFontSize(18);
    doc.text("Reporte Gerencial - TopSafe", 14, 20);
    doc.setFontSize(12);
    doc.text(`Fecha: ${dateStr} | Autorizado: Ingeniería`, 14, 28);
    
    // Resumen KPI
    doc.setDrawColor(200);
    doc.line(14, 32, 196, 32);
    doc.text(`Puntos Totales: ${totalPoints} | Unidades: ${totalUnits} | Eficiencia: ${averageEfficiency}%`, 14, 40);

    let startY = 50;

    // INCLUIR ANÁLISIS DE IA (Si existe)
    if (analysisResult) {
      doc.setFontSize(14);
      doc.setTextColor(234, 88, 12); // Naranja
      doc.text("Análisis de Inteligencia Artificial (Gemini)", 14, startY);
      
      doc.setFontSize(10);
      doc.setTextColor(0); // Negro
      // Limpiamos un poco el markdown para que se vea bien en PDF
      const cleanText = analysisResult.replace(/\*\*/g, '').replace(/###/g, '').replace(/>/g, '');
      const splitText = doc.splitTextToSize(cleanText, 180); // Ajustar texto al ancho
      doc.text(splitText, 14, startY + 8);
      
      // Calculamos dónde terminó el texto para empezar la tabla
      startY += 10 + (splitText.length * 5);
    }

    // TABLA DE DATOS
    autoTable(doc, {
      startY: startY + 5,
      head: [['Hora', 'Operario', 'Sector', 'Modelo', 'Operación', 'Cant', 'Pts']],
      body: displayLogs.map(l => [
        new Date(l.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        l.operator,
        l.sector,
        l.model,
        l.operation,
        l.quantity,
        l.points
      ]),
      theme: 'grid',
      headStyles: { fillColor: [234, 88, 12] } // Naranja corporativo
    });

    doc.save(`Reporte_TopSafe_${dateStr.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Dashboard Gerencial
            {isAuthorized && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full border border-green-200 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Acceso Ingeniería</span>}
          </h2>
          <p className="text-slate-500 text-sm">Visión general de la planta en tiempo real.</p>
        </div>
        <div className="flex gap-2">
           <select 
             className="bg-slate-50 border border-slate-300 rounded-lg text-sm p-2 outline-none"
             value={dateRange} onChange={(e) => setDateRange(e.target.value)}
           >
             <option value="today">Hoy</option>
           </select>
           
           {/* BOTÓN IA CON CANDADO */}
           <button 
             onClick={() => requestAccess('ai')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${isAuthorized ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
           >
             {isAuthorized ? <BrainCircuit className="w-5 h-5" /> : <Lock className="w-4 h-4"/>} 
             Análisis IA
           </button>

           {/* BOTÓN PDF CON CANDADO */}
           <button 
             onClick={() => requestAccess('pdf')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${isAuthorized ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
           >
             {isAuthorized ? <FileText className="w-5 h-5" /> : <Lock className="w-4 h-4"/>} 
             PDF
           </button>
        </div>
      </div>

      {/* --- TARJETAS KPI (Igual que antes) --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-500">
          <div className="flex justify-between">
            <div>
              <p className="text-slate-400 text-xs uppercase font-bold">Puntos Totales</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalPoints.toLocaleString()}</h3>
            </div>
            <TrendingUp className="text-orange-500 w-8 h-8 opacity-20" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
          <div className="flex justify-between">
            <div>
              <p className="text-slate-400 text-xs uppercase font-bold">Unidades Prod.</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalUnits.toLocaleString()}</h3>
            </div>
            <Box className="text-blue-500 w-8 h-8 opacity-20" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
          <div className="flex justify-between">
            <div>
              <p className="text-slate-400 text-xs uppercase font-bold">Operarios Activos</p>
              <h3 className="text-2xl font-bold text-slate-800">{activeOperators}/{operators.length}</h3>
            </div>
            <Users className="text-green-500 w-8 h-8 opacity-20" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500">
          <div className="flex justify-between">
            <div>
              <p className="text-slate-400 text-xs uppercase font-bold">Eficiencia Planta</p>
              <h3 className="text-2xl font-bold text-slate-800">{averageEfficiency}%</h3>
            </div>
            <Activity className="text-purple-500 w-8 h-8 opacity-20" />
          </div>
        </div>
      </div>

      {/* --- GRÁFICOS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
          <h3 className="font-bold text-slate-700 mb-4">Producción por Sector</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sectorData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#ea580c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
          <h3 className="font-bold text-slate-700 mb-4">Top 5 Modelos</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={modelData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {modelData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- TABLA DETALLADA --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
           <h3 className="font-bold text-slate-700">Registros Recientes</h3>
           <select 
             className="text-sm border border-slate-300 rounded p-1"
             value={selectedOperator}
             onChange={(e) => setSelectedOperator(e.target.value)}
           >
             <option value="all">Todos los operarios</option>
             {operators.map(op => <option key={op} value={op}>{op}</option>)}
           </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
              <tr><th className="px-6 py-3">Hora</th><th className="px-6 py-3">Operario</th><th className="px-6 py-3">Sector</th><th className="px-6 py-3">Modelo</th><th className="px-6 py-3 text-right">Cant.</th><th className="px-6 py-3 text-right">Pts</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayLogs.slice(0, 10).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-500">{new Date(log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td className="px-6 py-3 font-medium text-slate-800">{log.operator}</td>
                  <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${log.sector === 'Corte' ? 'bg-blue-100 text-blue-700' : log.sector === 'Costura' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{log.sector}</span></td>
                  <td className="px-6 py-3 text-slate-600 truncate max-w-xs">{log.model} - {log.operation}</td>
                  <td className="px-6 py-3 text-right font-bold">{log.quantity}</td>
                  <td className="px-6 py-3 text-right text-green-600 font-bold">+{log.points.toFixed(1)}</td>
                </tr>
              ))}
              {displayLogs.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No hay registros hoy.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL PASSWORD (Seguridad) --- */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 p-6 text-white text-center">
              <Lock className="w-10 h-10 mx-auto mb-2 text-orange-500" />
              <h3 className="text-lg font-bold">Acceso Restringido</h3>
              <p className="text-slate-400 text-xs">Área exclusiva de Ingeniería</p>
            </div>
            <form onSubmit={verifyPassword} className="p-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contraseña</label>
              <input 
                type="password" 
                autoFocus
                className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-orange-500 mb-4 font-mono text-center tracking-widest"
                placeholder="••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-lg font-bold hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700">Desbloquear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL ANÁLISIS IA --- */}
      {showAnalysisModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-6 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <BrainCircuit className="w-8 h-8" />
                <div>
                  <h3 className="text-xl font-bold">Gemini AI - Análisis</h3>
                  <p className="text-indigo-100 text-xs">Reporte Inteligente TopSafe</p>
                </div>
              </div>
              {!analyzing && <button onClick={() => setShowAnalysisModal(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>}
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto">
              {analyzing ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                  <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
                  <p className="text-lg font-medium animate-pulse">Consultando a Gemini...</p>
                </div>
              ) : (
                <div className="prose prose-slate max-w-none">
                  <div className="whitespace-pre-wrap text-slate-700 text-sm leading-relaxed font-medium">
                    {analysisResult}
                  </div>
                </div>
              )}
            </div>

            {!analyzing && (
              <div className="bg-slate-50 p-4 flex justify-end gap-3">
                 <button onClick={executeExportPDF} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 px-4 py-2 font-semibold">
                   <FileText className="w-4 h-4"/> Descargar este Reporte en PDF
                 </button>
                <button onClick={() => setShowAnalysisModal(false)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700">Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
