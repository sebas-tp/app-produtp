import React, { useEffect, useState } from 'react';
import { 
  getLogs, clearLogs, downloadCSV, downloadPDF, 
  getProductivityTarget, saveProductivityTarget, getOperators,
  getPointsMatrix 
} from '../services/dataService';
import { analyzeProductionData } from '../services/geminiService';
import { ProductionLog, Sector, PointRule } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Trash2, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, 
  Pencil, Save, Users, TrendingUp, Box, Lock, BrainCircuit, X, ShieldCheck, Trophy, Hash, Activity, Filter,
  Scale, AlertTriangle, Clock, AlertOctagon
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

export const ManagerDashboard: React.FC = () => {
  // --- DATOS ---
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- UI / FILTROS ---
  const [activeTab, setActiveTab] = useState<'metrics' | 'audit'>('metrics');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [rankingFilter, setRankingFilter] = useState<string>('Global');

  // --- CONFIGURACIÓN DE EFICIENCIA (NUEVO) ---
  const [workingDays, setWorkingDays] = useState<number>(5); // Días trabajados en el periodo
  const [shiftHours, setShiftHours] = useState<number>(8.5); // Horas por turno
  const [pointsPerHour, setPointsPerHour] = useState<number>(3600); // Base de cálculo

  // --- META Y AUDITORÍA ---
  const [dailyTarget, setDailyTarget] = useState<number>(24960);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState<string>("24960");
  const [tangoInputs, setTangoInputs] = useState<Record<string, string>>({});

  // --- SEGURIDAD ---
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showEngineeringModal, setShowEngineeringModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const MASTER_PASSWORD = "admin123";

  // --- INICIALIZACIÓN ---
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [logs, target, ops, mtx] = await Promise.all([
          getLogs(), getProductivityTarget(), getOperators(), getPointsMatrix()
        ]);
        setAllLogs(logs);
        setDailyTarget(target || 24960);
        setTempTarget((target || 24960).toString());
        setOperatorList(ops);
        setMatrix(mtx);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => { applyFilters(); }, [allLogs, startDate, endDate, selectedOperator]);

  const refreshData = async () => {
    setLoading(true);
    const [logs, mtx] = await Promise.all([getLogs(), getPointsMatrix()]);
    setAllLogs(logs);
    setMatrix(mtx);
    setLoading(false);
  };

  const applyFilters = () => {
    const filtered = allLogs.filter(log => {
      const logDate = log.timestamp.split('T')[0];
      const dateMatch = logDate >= startDate && logDate <= endDate;
      const operatorMatch = selectedOperator === 'all' || log.operatorName === selectedOperator;
      return dateMatch && operatorMatch;
    });
    setFilteredLogs(filtered);
  };

  // --- CÁLCULOS VISUALES Y EFICIENCIA ---
  const dailyTrend = Object.values(filteredLogs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; 
    const shortDate = new Date(log.timestamp).toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'});
    if (!acc[date]) acc[date] = { fullDate: date, name: shortDate, points: 0, quantity: 0 };
    acc[date].points += log.totalPoints;
    acc[date].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { fullDate:string, name: string; points: number; quantity: number }>))
  .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  // CÁLCULO DE RANKING CON OCIO (NUEVO)
  const rankingStats = Object.values(filteredLogs.filter(log => rankingFilter === 'Global' || log.sector === rankingFilter).reduce((acc, log) => {
    if (!acc[log.operatorName]) acc[log.operatorName] = { name: log.operatorName, points: 0, quantity: 0 };
    acc[log.operatorName].points += log.totalPoints; acc[log.operatorName].quantity += log.quantity; return acc;
  }, {} as Record<string, { name: string; points: number; quantity: number }>))
  .map(stat => {
      // FÓRMULA DEL USUARIO: Días * Horas * 3600
      const potentialPoints = workingDays * shiftHours * pointsPerHour;
      const idlePoints = potentialPoints - stat.points;
      const idlePercentage = potentialPoints > 0 ? (idlePoints / potentialPoints) * 100 : 0;
      
      return { 
          ...stat, 
          percentage: (stat.points / dailyTarget) * 100, // vs Meta diaria (referencia simple)
          potentialPoints,
          idlePoints,
          idlePercentage
      };
  })
  .sort((a, b) => b.points - a.points);

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 }; acc[log.sector].value += log.quantity; return acc;
  }, {} as Record<string, { name: string; value: number }>));

  const modelStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.model]) acc[log.model] = { name: log.model, value: 0 }; acc[log.model].value += log.quantity; return acc;
  }, {} as Record<string, { name: string; value: number }>)).sort((a, b) => b.value - a.value).slice(0, 5);
  
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

  // --- AUDITORÍA (STOCK) ---
  const getAuditData = () => {
    const modelsInLogs = Array.from(new Set(filteredLogs.map(l => l.model)));
    return modelsInLogs.map(modelName => {
      const declaredPoints = filteredLogs.filter(l => l.model === modelName).reduce((sum, l) => sum + l.totalPoints, 0);
      const standardValue = matrix.filter(r => r.model === modelName).reduce((sum, r) => sum + r.pointsPerUnit, 0);
      const tangoQty = parseInt(tangoInputs[modelName] || '0');
      const theoreticalPoints = tangoQty * standardValue;
      const difference = declaredPoints - theoreticalPoints;
      const deviationPct = theoreticalPoints > 0 ? ((difference / theoreticalPoints) * 100) : 0;
      return { model: modelName, standardValue, declaredPoints, tangoQty, theoreticalPoints, difference, deviationPct };
    }).sort((a, b) => b.declaredPoints - a.declaredPoints);
  };

  // --- HANDLERS VARIOS ---
  const handleSaveTarget = async () => {
    const newVal = parseInt(tempTarget);
    if (!isNaN(newVal) && newVal > 0) { await saveProductivityTarget(newVal); setDailyTarget(newVal); setIsEditingTarget(false); refreshData(); }
  };
  const handleClearData = async () => { if (window.confirm("¡PELIGRO! ¿Borrar todo el historial?")) { setLoading(true); await clearLogs(); await refreshData(); }};
  const handleDownloadExcel = () => { downloadCSV(filteredLogs, `Reporte_${selectedOperator}_${startDate}`); };
  const handleDownloadStandardPDF = () => { downloadPDF(filteredLogs, `Reporte: ${startDate} al ${endDate}`, `Reporte_${startDate}`); };
  const handleEngineeringAccess = () => { if (isAuthorized) openEngineeringModal(); else setShowAuthModal(true); };
  const verifyPassword = (e: React.FormEvent) => { e.preventDefault(); if (passwordInput === MASTER_PASSWORD) { setIsAuthorized(true); setShowAuthModal(false); setPasswordInput(''); openEngineeringModal(); } else { alert("Acceso denegado."); }};
  const openEngineeringModal = async () => { setShowEngineeringModal(true); if (!analysisResult) runAnalysis(); };
  const runAnalysis = async () => { setIsAnalyzing(true); try { const result = await analyzeProductionData(filteredLogs, allLogs, operatorList, selectedOperator, dailyTarget); setAnalysisResult(result); } catch (e) { setAnalysisResult("Error al generar análisis."); } finally { setIsAnalyzing(false); }};

  const handleFullReportPDF = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(22); doc.setTextColor(30, 41, 59); doc.text(`Informe Técnico de Producción`, 14, 20);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`TopSafe S.A. | ${new Date().toLocaleDateString()}`, 14, 28);
    
    if (activeTab === 'audit') {
        const auditData = getAuditData();
        doc.text("REPORTE DE AUDITORÍA (VS TANGO)", 14, 45);
        autoTable(doc, { startY: 50, head: [['Modelo', 'Valor Std', 'Tango', 'Teórico', 'Declarado', 'Desvío']], body: auditData.map(d => [d.model, d.standardValue.toFixed(1), d.tangoQty, d.theoreticalPoints.toFixed(0), d.declaredPoints.toFixed(0), d.difference.toFixed(0)]) });
        doc.save(`Auditoria.pdf`); setIsGeneratingPDF(false); return;
    }
    
    doc.text("Resumen de Eficiencia", 14, 45);
    // Tabla de eficiencia en PDF
    const effRows = rankingStats.map(stat => [
        stat.name, 
        stat.points.toFixed(0), 
        stat.potentialPoints.toFixed(0), 
        stat.idlePoints.toFixed(0),
        stat.idlePercentage.toFixed(1) + '%'
    ]);
    autoTable(doc, { startY: 50, head: [['Operario', 'Real', 'Potencial', 'Ocio (Pts)', '% Ocio']], body: effRows });
    doc.save(`Reporte_Eficiencia.pdf`); setIsGeneratingPDF(false);
  };

  if (loading && allLogs.length === 0) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  const auditData = getAuditData();

  return (
    <div className="space-y-6 p-4 md:p-8 pb-20">
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h2>
           <div className="flex gap-4 mt-2">
             <button onClick={() => setActiveTab('metrics')} className={`text-sm font-bold px-3 py-1 rounded-full transition-colors ${activeTab === 'metrics' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>Métricas & Ocio</button>
             <button onClick={() => setActiveTab('audit')} className={`text-sm font-bold px-3 py-1 rounded-full transition-colors ${activeTab === 'audit' ? 'bg-red-100 text-red-700' : 'text-slate-500 hover:bg-slate-50'}`}>Auditoría vs Tango</button>
           </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
            {activeTab === 'metrics' && (
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <Users className="w-4 h-4 text-slate-500" />
                    <select value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700 font-medium">
                        <option value="all">Global (Todos)</option>
                        <option disabled>──────────</option>
                        {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                </div>
            )}
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <Calendar className="w-4 h-4 text-slate-500" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
                <span className="text-slate-400">-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
            </div>
            <div className="flex gap-2">
                <button onClick={handleFullReportPDF} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" title="Descargar Reporte"><FileText className="w-5 h-5" /></button>
                <button onClick={refreshData} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><RefreshCw className="w-5 h-5" /></button>
                <button onClick={handleEngineeringAccess} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isAuthorized ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{isAuthorized ? <BrainCircuit className="w-4 h-4" /> : <Lock className="w-4 h-4" />}{isAuthorized ? 'Ingeniería' : 'Acceso'}</button>
            </div>
        </div>
      </div>

      {/* --- VISTA: MÉTRICAS + OCIO --- */}
      {activeTab === 'metrics' && (
        <div className="space-y-6 animate-in fade-in">
            {/* KPI CARDS (Resumidas) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><p className="text-sm text-slate-500 font-medium uppercase">Producción (u)</p><p className="text-3xl font-bold text-slate-800 mt-2">{filteredLogs.reduce((sum, log) => sum + log.quantity, 0).toLocaleString()}</p></div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><p className="text-sm text-slate-500 font-medium uppercase">Puntos Reales</p><p className="text-3xl font-bold text-blue-600 mt-2">{filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0).toLocaleString('es-AR', {maximumFractionDigits:0})}</p></div>
                
                {/* CONFIGURADOR DE CAPACIDAD RAPIDA */}
                <div className="bg-indigo-50 p-4 rounded-xl shadow-sm border border-indigo-100 md:col-span-2 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-indigo-600"/><span className="text-xs font-bold text-indigo-800 uppercase">Configurar Capacidad del Periodo</span></div>
                    <div className="flex gap-4">
                        <div><label className="text-[10px] text-indigo-500 font-bold block">DÍAS HÁBILES</label><input type="number" value={workingDays} onChange={e => setWorkingDays(Number(e.target.value))} className="w-20 bg-white border border-indigo-200 rounded px-2 py-1 text-sm font-bold text-indigo-900"/></div>
                        <div><label className="text-[10px] text-indigo-500 font-bold block">HORAS JORNADA</label><input type="number" value={shiftHours} onChange={e => setShiftHours(Number(e.target.value))} className="w-20 bg-white border border-indigo-200 rounded px-2 py-1 text-sm font-bold text-indigo-900"/></div>
                        <div><label className="text-[10px] text-indigo-500 font-bold block">BASE PTS/HR</label><input type="number" value={pointsPerHour} onChange={e => setPointsPerHour(Number(e.target.value))} className="w-20 bg-white border border-indigo-200 rounded px-2 py-1 text-sm font-bold text-slate-500" disabled/></div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* TABLA DE EFICIENCIA Y OCIO (REEMPLAZA AL RANKING SIMPLE) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col h-[500px]">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600" /> Eficiencia & Ocio Laboral</h3>
                        <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                            <Filter className="w-3 h-3 text-slate-500"/>
                            <select value={rankingFilter} onChange={(e) => setRankingFilter(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer">
                                <option value="Global">Global</option>
                                <option disabled>──────</option>
                                {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="overflow-auto flex-1 border rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Operario</th>
                                    <th className="px-4 py-3 text-right">Real (Pts)</th>
                                    <th className="px-4 py-3 text-right text-indigo-600">Capacidad (Pts)</th>
                                    <th className="px-4 py-3 text-right text-red-600">Ocio (Pts)</th>
                                    <th className="px-4 py-3 text-center">% Ocio</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rankingStats.map((stat, idx) => (
                                    <tr key={stat.name} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-bold text-slate-700 flex items-center gap-2">
                                            <span className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full text-white ${idx===0?'bg-amber-400':(idx===1?'bg-slate-400':'bg-orange-300')}`}>{idx+1}</span>
                                            {stat.name}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">{stat.points.toLocaleString('es-AR')}</td>
                                        <td className="px-4 py-3 text-right text-indigo-600 bg-indigo-50/30">{stat.potentialPoints.toLocaleString('es-AR')}</td>
                                        <td className="px-4 py-3 text-right font-bold text-red-600 bg-red-50/30">{stat.idlePoints.toLocaleString('es-AR')}</td>
                                        <td className="px-4 py-3 text-center">
                                            {stat.idlePoints > 0 ? (
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${stat.idlePercentage > 20 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {stat.idlePercentage.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">0% (Superávit)</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {rankingStats.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">Sin datos</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* GRAFICO TENDENCIA (PEQUEÑO) */}
                <div id="chart-trend" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[500px]">
                    <h3 className="text-md font-semibold text-slate-700 mb-4">Evolución Diaria</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <LineChart data={dailyTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{fontSize: 10}} /><YAxis width={40} tick={{fontSize: 10}} /><Tooltip /><Legend wrapperStyle={{fontSize: '10px'}} /><Line type="monotone" dataKey="points" name="Pts" stroke="#2563eb" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="quantity" name="Uni" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} /></LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 text-xs text-indigo-800 flex gap-4 items-center">
                <AlertOctagon className="w-5 h-5 text-indigo-600"/>
                <p><strong>Fórmula de Ocio:</strong> (Días Trab. × Horas × 3600) - Puntos Reales. <br/>Un porcentaje alto indica tiempo improductivo, falta de carga de datos o problemas de línea.</p>
            </div>
        </div>
      )}

      {/* --- VISTA: AUDITORÍA (STOCK) --- */}
      {activeTab === 'audit' && (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Scale className="w-6 h-6 text-red-600"/> Conciliación vs. Tango / Stock</h3>
                <p className="text-slate-500 text-sm mt-1">Comparativa entre producción declarada y stock ingresado.</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 uppercase text-xs font-bold border-b border-slate-200">
                            <tr><th className="px-6 py-4">Modelo</th><th className="px-6 py-4 text-right bg-blue-50/50">Valor Std</th><th className="px-6 py-4 text-right bg-blue-50/50">Declarado</th><th className="px-6 py-4 text-center bg-red-50/50 w-48">Cant. Real (Tango)</th><th className="px-6 py-4 text-right bg-red-50/50">Teórico</th><th className="px-6 py-4 text-right">Desvío</th><th className="px-6 py-4 text-center">Estado</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {auditData.map((row) => (
                                <tr key={row.model} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-800">{row.model}</td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 bg-blue-50/30">{row.standardValue.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-600 bg-blue-50/30">{row.declaredPoints.toLocaleString()}</td>
                                    <td className="px-6 py-4 bg-red-50/30"><div className="flex items-center justify-center"><input type="number" className="w-24 border border-red-200 rounded p-1 text-center font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-500" placeholder="0" value={tangoInputs[row.model] || ''} onChange={(e) => setTangoInputs({...tangoInputs, [row.model]: e.target.value})}/><span className="text-xs text-slate-400 ml-1">u.</span></div></td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 bg-red-50/30">{row.theoreticalPoints.toLocaleString()}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${row.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>{row.difference > 0 ? '+' : ''}{row.difference.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">{Math.abs(row.deviationPct) < 5 ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">OK</span> : <span className={`px-2 py-1 rounded text-xs font-bold border ${row.difference > 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>{row.difference > 0 ? 'Exceso' : 'Faltante'} ({Math.abs(row.deviationPct).toFixed(0)}%)</span>}</td>
                                </tr>
                            ))}
                            {auditData.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-slate-400">Sin datos.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* --- MODALES --- */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 p-6 text-white text-center"><Lock className="w-10 h-10 mx-auto mb-2 text-orange-500" /><h3 className="text-lg font-bold">Acceso Ingeniería</h3></div>
            <form onSubmit={verifyPassword} className="p-6">
              <input type="password" autoFocus className="w-full border rounded-lg p-3 outline-none mb-4 text-center tracking-widest font-mono text-xl" placeholder="••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
              <div className="flex gap-2"><button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-100 py-3 rounded-lg font-bold">Cancelar</button><button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700">Entrar</button></div>
            </form>
          </div>
        </div>
      )}

      {showEngineeringModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in zoom-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-4"><div className="bg-indigo-500/20 p-2 rounded-lg"><BrainCircuit className="w-8 h-8 text-indigo-400"/></div><div><h3 className="text-2xl font-bold">Modo Ingeniería</h3><p className="text-slate-400 text-sm flex items-center gap-2"><ShieldCheck className="w-3 h-3"/> Sesión Segura Activa</p></div></div>
              <button onClick={() => setShowEngineeringModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><X className="w-6 h-6"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
                    <h4 className="text-lg font-bold text-indigo-900 mb-4 border-b pb-2">Análisis de Inteligencia Artificial</h4>
                    {isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500"><Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" /><p className="animate-pulse">Generando reporte avanzado...</p></div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                        <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Reporte Automático</span><button onClick={runAnalysis} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Regenerar</button></div>
                        {analysisResult || "No hay datos suficientes para generar un análisis."}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-4">Exportación Avanzada</h4>
                    <button onClick={handleFullReportPDF} disabled={isGeneratingPDF} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] disabled:opacity-50">
                      {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin"/> : <FileText className="w-5 h-5" />} {isGeneratingPDF ? 'GENERANDO...' : 'DESCARGAR REPORTE COMPLETO'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white border-t p-4 flex justify-end shrink-0"><button onClick={() => setShowEngineeringModal(false)} className="text-slate-500 hover:text-slate-800 font-medium px-6">Volver al Dashboard</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
