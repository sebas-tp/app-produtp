import React, { useEffect, useState } from 'react';
// Usamos tus imports originales de servicios
import { getLogs, clearLogs, downloadCSV, getProductivityTarget, saveProductivityTarget, getOperators } from '../services/dataService';
// Importamos el nuevo servicio de IA (asegúrate que el archivo exista en services/geminiService.ts)
import { analyzeProductionData } from '../services/geminiService';
import { ProductionLog } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
// Agregamos íconos de seguridad
import { Trash2, BrainCircuit, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, Pencil, Save, Trophy, Users, TrendingUp, Box, Lock, ShieldCheck, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const ManagerDashboard: React.FC = () => {
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- FILTROS ---
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedOperator, setSelectedOperator] = useState<string>('all');

  // --- META ---
  const [dailyTarget, setDailyTarget] = useState<number>(24960);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState<string>("24960");

  // --- SEGURIDAD (CANDADO) ---
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'ai' | 'pdf' | null>(null);
  const MASTER_PASSWORD = "Ing.2026"; // <--- ¡CAMBIA ESTA CONTRASEÑA!

  // --- IA Y MODAL ---
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [logs, target, ops] = await Promise.all([
          getLogs(),
          getProductivityTarget(),
          getOperators()
        ]);
        setAllLogs(logs);
        setDailyTarget(target || 24960);
        setTempTarget((target || 24960).toString());
        setOperatorList(ops);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => { applyFilters(); }, [allLogs, startDate, endDate, selectedOperator]);

  const refreshData = async () => {
    setLoading(true);
    const logs = await getLogs();
    setAllLogs(logs);
    setLoading(false);
  };

  const applyFilters = () => {
    const filtered = allLogs.filter(log => {
      const logDate = log.timestamp.split('T')[0];
      return logDate >= startDate && logDate <= endDate && (selectedOperator === 'all' || log.operatorName === selectedOperator);
    });
    setFilteredLogs(filtered);
  };

  const handleSaveTarget = async () => {
    const newVal = parseInt(tempTarget);
    if (!isNaN(newVal) && newVal > 0) {
      await saveProductivityTarget(newVal);
      setDailyTarget(newVal);
      setIsEditingTarget(false);
    }
  };

  const handleClearData = async () => {
    if (window.confirm("¡PELIGRO! ¿Está seguro de eliminar TODOS los registros históricos?")) {
      setLoading(true);
      await clearLogs();
      await refreshData();
    }
  };

  // --- SISTEMA DE SEGURIDAD ---
  const requestAccess = (action: 'ai' | 'pdf') => {
    if (isAuthorized) {
      if (action === 'ai') executeAnalysis();
      if (action === 'pdf') executeExportPDF();
    } else {
      setPendingAction(action);
      setShowAuthModal(true);
    }
  };

  const verifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === MASTER_PASSWORD) {
      setIsAuthorized(true);
      setShowAuthModal(false);
      setPasswordInput('');
      if (pendingAction === 'ai') executeAnalysis();
      if (pendingAction === 'pdf') executeExportPDF();
    } else {
      alert("Contraseña incorrecta.");
    }
  };

  // --- ACCIONES PROTEGIDAS ---
  const executeAnalysis = async () => {
    setIsAnalyzing(true);
    setShowAnalysisModal(true);
    // Calculamos el total de puntos filtrados
    const totalPoints = filteredLogs.reduce((acc, curr) => acc + curr.totalPoints, 0);
    const result = await analyzeProductionData(filteredLogs, operatorList, totalPoints);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  const executeExportPDF = () => {
    const doc = new jsPDF();
    const title = `Reporte: ${startDate} al ${endDate} (${selectedOperator === 'all' ? 'Global' : selectedOperator})`;
    
    doc.setFontSize(18);
    doc.text("Reporte Gerencial - TopSafe", 14, 20);
    doc.setFontSize(12);
    doc.text(title, 14, 28);
    
    const totalPts = filteredLogs.reduce((acc, curr) => acc + curr.totalPoints, 0);
    const totalQty = filteredLogs.reduce((acc, curr) => acc + curr.quantity, 0);
    
    doc.text(`Total Puntos: ${totalPts.toFixed(2)} | Unidades: ${totalQty}`, 14, 36);

    let startY = 45;
    
    // Si hay análisis de IA visible, lo agregamos
    if (analysisResult) {
      doc.setFontSize(14);
      doc.setTextColor(234, 88, 12);
      doc.text("Análisis Inteligente", 14, startY);
      doc.setFontSize(10);
      doc.setTextColor(0);
      const cleanText = analysisResult.replace(/\*\*/g, '').replace(/###/g, '');
      const splitText = doc.splitTextToSize(cleanText, 180);
      doc.text(splitText, 14, startY + 8);
      startY += 10 + (splitText.length * 5);
    }

    autoTable(doc, {
      startY: startY,
      head: [['Fecha', 'Operario', 'Sector', 'Modelo', 'Operación', 'Cant', 'Pts']],
      body: filteredLogs.map(l => [
        new Date(l.timestamp).toLocaleDateString(),
        l.operatorName,
        l.sector,
        l.model,
        l.operation,
        l.quantity,
        l.totalPoints.toFixed(2)
      ]),
      theme: 'grid'
    });
    doc.save(`Reporte_TopSafe.pdf`);
  };

  // --- PREPARACIÓN GRÁFICOS ---
  const operatorStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.operatorName]) acc[log.operatorName] = { name: log.operatorName, points: 0 };
    acc[log.operatorName].points += log.totalPoints;
    return acc;
  }, {} as Record<string, { name: string; points: number }>)).sort((a, b) => b.points - a.points);

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 };
    acc[log.sector].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  if (loading && allLogs.length === 0) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             Dashboard Gerencial
             {isAuthorized && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full border border-green-200 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Ingeniería</span>}
           </h2>
           <p className="text-slate-500 text-sm">Resumen de producción y métricas</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
           {/* Filtros */}
           <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <Users className="w-4 h-4 text-slate-500" />
              <select value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)} className="bg-transparent text-sm outline-none">
                 <option value="all">Todos</option>
                 {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
           </div>
           
           {/* Botones Protegidos */}
           <button onClick={() => requestAccess('ai')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isAuthorized ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
             {isAuthorized ? <BrainCircuit className="w-4 h-4" /> : <Lock className="w-4 h-4"/>} IA
           </button>
           <button onClick={() => requestAccess('pdf')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isAuthorized ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-200 text-slate-500'}`}>
             {isAuthorized ? <FileText className="w-4 h-4" /> : <Lock className="w-4 h-4"/>} PDF
           </button>

           <button onClick={refreshData} className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"><RefreshCw className="w-5 h-5 text-slate-600" /></button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-600">
          <p className="text-sm text-slate-500 font-bold uppercase">Puntos Totales</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0).toFixed(1)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-600">
          <p className="text-sm text-slate-500 font-bold uppercase">Unidades</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{filteredLogs.reduce((sum, log) => sum + log.quantity, 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-amber-500">
          <p className="text-sm text-slate-500 font-bold uppercase">Meta Diaria</p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-3xl font-bold text-slate-800">{dailyTarget.toLocaleString()}</p>
            {!isEditingTarget ? <button onClick={() => setIsEditingTarget(true)}><Pencil className="w-4 h-4 text-slate-400"/></button> : 
             <div className="flex gap-1"><input type="number" value={tempTarget} onChange={e=>setTempTarget(e.target.value)} className="w-20 border rounded p-1"/><button onClick={handleSaveTarget}><Save className="w-4 h-4 text-emerald-600"/></button></div>}
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm h-80">
          <h3 className="text-md font-bold text-slate-700 mb-4">Producción por Sector</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={countBySector} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">
                {countBySector.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm h-80">
          <h3 className="text-md font-bold text-slate-700 mb-4">Ranking Operarios (Puntos)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={operatorStats.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} interval={0} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="points" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MODAL PASSWORD */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in">
            <div className="bg-slate-900 p-6 text-white text-center">
              <Lock className="w-10 h-10 mx-auto mb-2 text-orange-500" />
              <h3 className="text-lg font-bold">Acceso Ingeniería</h3>
            </div>
            <form onSubmit={verifyPassword} className="p-6">
              <input type="password" autoFocus className="w-full border rounded-lg p-3 outline-none mb-4 text-center tracking-widest" placeholder="Contraseña" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-100 py-3 rounded-lg font-bold">Cancelar</button>
                <button type="submit" className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-bold">Entrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AI ANALYSIS */}
      {showAnalysisModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in">
            <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
              <h3 className="text-xl font-bold flex items-center gap-2"><BrainCircuit className="w-6 h-6"/> Análisis IA</h3>
              {!isAnalyzing && <button onClick={() => setShowAnalysisModal(false)}><X className="w-6 h-6"/></button>}
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              {isAnalyzing ? (
                <div className="flex flex-col items-center py-10"><Loader2 className="w-12 h-12 animate-spin text-indigo-600"/><p>Analizando...</p></div>
              ) : (
                <div className="prose prose-sm max-w-none"><ReactMarkdown>{analysisResult}</ReactMarkdown></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
