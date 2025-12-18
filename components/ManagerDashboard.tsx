import React, { useEffect, useState } from 'react';
import { 
  getLogs, clearLogs, downloadCSV, downloadPDF, 
  getProductivityTarget, saveProductivityTarget, getOperators 
} from '../services/dataService';
import { analyzeProductionData } from '../services/geminiService';
import { ProductionLog } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Trash2, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, 
  Pencil, Save, Users, TrendingUp, Box, Lock, BrainCircuit, X, ShieldCheck, Trophy, Hash, Activity 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

export const ManagerDashboard: React.FC = () => {
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedOperator, setSelectedOperator] = useState<string>('all');

  const [dailyTarget, setDailyTarget] = useState<number>(24960);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState<string>("24960");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showEngineeringModal, setShowEngineeringModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const MASTER_PASSWORD = "admin";

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [logs, target, ops] = await Promise.all([
          getLogs(), getProductivityTarget(), getOperators()
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

  useEffect(() => { 
    applyFilters(); 
    setAnalysisResult(''); 
  }, [allLogs, startDate, endDate, selectedOperator]);

  const refreshData = async () => {
    setLoading(true);
    const logs = await getLogs();
    setAllLogs(logs);
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

  const handleSaveTarget = async () => {
    const newVal = parseInt(tempTarget);
    if (!isNaN(newVal) && newVal > 0) {
      await saveProductivityTarget(newVal);
      setDailyTarget(newVal);
      setIsEditingTarget(false);
      refreshData(); 
    }
  };

  const handleClearData = async () => {
    if (window.confirm("¡PELIGRO! ¿Está seguro de eliminar TODOS los registros históricos?")) {
      setLoading(true);
      await clearLogs();
      await refreshData();
    }
  };

  const handleDownloadExcel = () => {
    const filename = `Reporte_${selectedOperator === 'all' ? 'Global' : selectedOperator}_${startDate}_al_${endDate}`;
    downloadCSV(filteredLogs, filename);
  };

  const handleDownloadStandardPDF = () => {
    const title = `Reporte: ${startDate} al ${endDate} (${selectedOperator === 'all' ? 'Global' : selectedOperator})`;
    const filename = `Reporte_${startDate}_al_${endDate}`;
    downloadPDF(filteredLogs, title, filename);
  };

  const handleEngineeringAccess = () => {
    if (isAuthorized) openEngineeringModal();
    else setShowAuthModal(true);
  };

  const verifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === MASTER_PASSWORD) {
      setIsAuthorized(true);
      setShowAuthModal(false);
      setPasswordInput('');
      openEngineeringModal();
    } else {
      alert("Acceso denegado.");
    }
  };

  const openEngineeringModal = async () => {
    setShowEngineeringModal(true);
    if (!analysisResult) runAnalysis();
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeProductionData(filteredLogs, allLogs, operatorList, selectedOperator);
      setAnalysisResult(result);
    } catch (e) {
      setAnalysisResult("Error al generar análisis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFullReportPDF = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    const title = `Reporte de Ingeniería TopSafe`;
    
    doc.setFontSize(18);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generado por: Ingeniería | Fecha: ${new Date().toLocaleDateString()}`, 14, 26);
    doc.text(`Filtro: ${selectedOperator} | ${startDate} al ${endDate}`, 14, 32);

    let startY = 40;

    if (analysisResult) {
      doc.setFontSize(12);
      doc.setTextColor(234, 88, 12);
      doc.text("Análisis Inteligente", 14, startY);
      doc.setFontSize(10);
      doc.setTextColor(0);
      const cleanText = analysisResult.replace(/\*\*/g, '').replace(/###/g, '').replace(/>/g, '');
      const splitText = doc.splitTextToSize(cleanText, 180);
      doc.text(splitText, 14, startY + 8);
      startY += 10 + (splitText.length * 5); 
    }

    try {
      await new Promise(r => setTimeout(r, 500)); 
      const chartTrend = document.getElementById('chart-trend');
      const chartSector = document.getElementById('chart-sector');
      
      if (chartTrend) {
        doc.addPage(); 
        doc.setFontSize(14);
        doc.text("Evolución de Producción", 14, 20);
        const canvas1 = await html2canvas(chartTrend, { scale: 2, backgroundColor: '#ffffff' });
        const img1 = canvas1.toDataURL('image/png');
        doc.addImage(img1, 'PNG', 14, 30, 180, 80); 
      }

      if (chartSector) {
        doc.text("Distribución por Sector", 14, 120);
        const canvas2 = await html2canvas(chartSector, { scale: 2, backgroundColor: '#ffffff' });
        const img2 = canvas2.toDataURL('image/png');
        doc.addImage(img2, 'PNG', 14, 130, 180, 80);
      }
    } catch (e) {
      console.error("Error gráficos:", e);
    }

    doc.addPage();
    doc.text("Detalle de Registros", 14, 20);

    autoTable(doc, {
      startY: 25,
      head: [['Fecha', 'Orden', 'Operario', 'Sector', 'Modelo', 'Pts']],
      body: filteredLogs.map(l => [
        new Date(l.timestamp).toLocaleDateString(),
        l.orderNumber || '-', 
        l.operatorName,
        l.sector,
        l.model,
        l.totalPoints.toFixed(1)
      ]),
      theme: 'grid'
    });

    doc.save(`Reporte_Ingenieria_${new Date().toISOString().split('T')[0]}.pdf`);
    setIsGeneratingPDF(false);
  };

  // DATOS CALCULADOS
  const operatorStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.operatorName]) {
      acc[log.operatorName] = { name: log.operatorName, points: 0, quantity: 0 };
    }
    acc[log.operatorName].points += log.totalPoints;
    acc[log.operatorName].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; points: number; quantity: number }>))
  .map(stat => ({ ...stat, percentage: (stat.points / dailyTarget) * 100 }))
  .sort((a, b) => b.points - a.points);

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 };
    acc[log.sector].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>));

  const dailyTrend = Object.values(filteredLogs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; 
    const shortDate = new Date(log.timestamp).toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'});
    if (!acc[date]) acc[date] = { fullDate: date, name: shortDate, points: 0, quantity: 0 };
    acc[date].points += log.totalPoints;
    acc[date].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { fullDate:string, name: string; points: number; quantity: number }>))
  .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  const modelStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.model]) acc[log.model] = { name: log.model, value: 0 };
    acc[log.model].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>))
  .sort((a, b) => b.value - a.value).slice(0, 5);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

  if (loading && allLogs.length === 0) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h2>
           <p className="text-slate-500 text-sm">Resumen de producción y métricas</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-center w-full xl:w-auto flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <Users className="w-4 h-4 text-slate-500" />
             <select value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700 font-medium">
                <option value="all">Vista Global (Todos)</option>
                <option disabled>──────────</option>
                {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
             </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <Calendar className="w-4 h-4 text-slate-500" />
             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
             <span className="text-slate-400">-</span>
             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
             <button onClick={handleDownloadExcel} className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200" title="Excel"><FileDown className="w-5 h-5" /></button>
             <button onClick={handleDownloadStandardPDF} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" title="PDF Básico"><FileText className="w-5 h-5" /></button>
             <button onClick={refreshData} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><RefreshCw className="w-5 h-5" /></button>
             <div className="h-8 w-px bg-slate-300 mx-1"></div>
             <button 
               onClick={handleEngineeringAccess} 
               className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isAuthorized ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
             >
               {isAuthorized ? <BrainCircuit className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
               {isAuthorized ? 'Ingeniería' : 'Acceso Ing.'}
             </button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl shadow-md border border-slate-700 text-white md:col-span-1">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Target className="w-4 h-4 text-amber-500" /> Meta Diaria</p>
            {!isEditingTarget ? <button onClick={() => setIsEditingTarget(true)}><Pencil className="w-4 h-4 text-slate-400 hover:text-white" /></button> : <button onClick={handleSaveTarget}><Save className="w-4 h-4 text-emerald-400" /></button>}
          </div>
          {isEditingTarget ? <input type="number" value={tempTarget} onChange={(e) => setTempTarget(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xl font-bold w-full text-white" autoFocus /> : <p className="text-3xl font-black mt-1 tracking-tight">{dailyTarget.toLocaleString()} <span className="text-sm font-normal text-slate-400">pts</span></p>}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><p className="text-sm text-slate-500 font-medium uppercase">Producción (u)</p><p className="text-3xl font-bold text-slate-800 mt-2">{filteredLogs.reduce((sum, log) => sum + log.quantity, 0).toLocaleString()}</p></div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><p className="text-sm text-slate-500 font-medium uppercase">Puntos Totales</p><p className="text-3xl font-bold text-blue-600 mt-2">{filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0).toFixed(1)}</p></div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><p className="text-sm text-slate-500 font-medium uppercase">Registros</p><p className="text-3xl font-bold text-emerald-600 mt-2">{filteredLogs.length}</p></div>
      </div>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* PANEL LATERAL: RANKING O TABLA DIARIA */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col h-96">
          {selectedOperator === 'all' ? (
            // VISTA GLOBAL: MOSTRAR RANKING
            <>
              <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Ranking del Período</h3>
              <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                 {operatorStats.map((stat) => (
                   <div key={stat.name} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                     <div className="flex justify-between items-center mb-1"><span className="font-bold text-slate-700">{stat.name}</span><span className="text-sm font-bold text-slate-600">{stat.points.toFixed(0)} pts</span></div>
                     <div className="w-full bg-slate-200 rounded-full h-2"><div className="h-full bg-amber-500" style={{ width: `${Math.min(stat.percentage, 100)}%` }}></div></div>
                   </div>
                 ))}
              </div>
            </>
          ) : (
            // VISTA INDIVIDUAL: MOSTRAR TABLA DIARIA
            <>
              <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600" /> Eficiencia Diaria</h3>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-right">Pts</th><th className="p-2 text-right">%</th></tr>
                  </thead>
                  <tbody>
                    {dailyTrend.map((day) => {
                      const eff = (day.points / dailyTarget) * 100;
                      return (
                        <tr key={day.fullDate} className="border-b border-slate-50">
                          <td className="p-2 font-medium">{day.name}</td>
                          <td className="p-2 text-right">{day.points.toFixed(0)}</td>
                          <td className="p-2 text-right"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${eff>=100?'bg-green-100 text-green-700':(eff>=80?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700')}`}>{eff.toFixed(0)}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* GRÁFICO DE TENDENCIA */}
        <div id="chart-trend" className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 lg:col-span-2`}>
          <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600"/> Evolución Diaria</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{fontSize: 12}} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="points" name="Puntos" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} />
              <Line type="monotone" dataKey="quantity" name="Unidades" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div id="chart-sector" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
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

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
          <h3 className="text-md font-semibold text-slate-700 mb-4">Top 5 Modelos</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modelStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false}/>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} />
              <Tooltip />
              <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} name="Unidades" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HISTORIAL DETALLADO */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-8">
         <div className="px-6 py-4 border-b border-slate-100 flex justify-between"><h3 className="font-semibold text-slate-800">Historial Detallado</h3><button onClick={handleClearData} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5"/></button></div>
         <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm text-left text-slate-600">
               <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Orden</th>
                    <th className="px-6 py-3">Operario</th>
                    <th className="px-6 py-3">Sector</th>
                    <th className="px-6 py-3">Modelo</th>
                    <th className="px-6 py-3 text-right">Cant</th>
                    <th className="px-6 py-3 text-right">Pts</th>
                  </tr>
               </thead>
               <tbody>
                  {filteredLogs.slice(0, 100).map(log => (
                     <tr key={log.id} className="border-b hover:bg-slate-50">
                        <td className="px-6 py-4">{new Date(log.timestamp).toLocaleDateString()}</td>
                        <td className="px-6 py-4 font-mono text-xs">{log.orderNumber || '-'}</td>
                        <td className="px-6 py-4 font-bold">{log.operatorName}</td>
                        <td className="px-6 py-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{log.sector}</span></td>
                        <td className="px-6 py-4">{log.model} - {log.operation}</td>
                        <td className="px-6 py-4 text-right">{log.quantity}</td>
                        <td className="px-6 py-4 text-right font-bold text-blue-600">{log.totalPoints.toFixed(1)}</td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {/* MODAL 1: CONTRASEÑA */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 p-6 text-white text-center">
              <Lock className="w-10 h-10 mx-auto mb-2 text-orange-500" />
              <h3 className="text-lg font-bold">Acceso Ingeniería</h3>
            </div>
            <form onSubmit={verifyPassword} className="p-6">
              <input type="password" autoFocus className="w-full border rounded-lg p-3 outline-none mb-4 text-center tracking-widest font-mono text-xl" placeholder="••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-100 py-3 rounded-lg font-bold">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700">Entrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MODO INGENIERÍA */}
      {showEngineeringModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in zoom-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-500/20 p-2 rounded-lg"><BrainCircuit className="w-8 h-8 text-indigo-400"/></div>
                <div>
                  <h3 className="text-2xl font-bold">Modo Ingeniería</h3>
                  <p className="text-slate-400 text-sm flex items-center gap-2"><ShieldCheck className="w-3 h-3"/> Sesión Segura Activa</p>
                </div>
              </div>
              <button onClick={() => setShowEngineeringModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><X className="w-6 h-6"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
                    <h4 className="text-lg font-bold text-indigo-900 mb-4 border-b pb-2">Análisis de Inteligencia Artificial</h4>
                    {isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
                        <p className="animate-pulse">Generando reporte avanzado...</p>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                        <div className="flex justify-between items-center mb-4">
                           <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Reporte Automático</span>
                           <button onClick={runAnalysis} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Regenerar</button>
                        </div>
                        {analysisResult || "No hay datos suficientes para generar un análisis."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-4">Exportación Avanzada</h4>
                    <p className="text-sm text-slate-500 mb-6">Genera un documento oficial incluyendo el análisis de IA, gráficos estadísticos y tablas de datos completos.</p>
                    <button 
                      onClick={handleFullReportPDF} 
                      disabled={isGeneratingPDF}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] disabled:opacity-50"
                    >
                      {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin"/> : <FileText className="w-5 h-5" />} 
                      {isGeneratingPDF ? 'GENERANDO...' : 'DESCARGAR REPORTE COMPLETO'}
                    </button>
                  </div>
                  
                  <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                    <h4 className="font-bold text-indigo-900 mb-2">Estado del Sistema</h4>
                    <ul className="text-sm space-y-2 text-indigo-800">
                      <li>• Motor de Análisis: <span className="font-bold text-green-600">Local v2.0</span></li>
                      <li>• Registros Analizados: <span className="font-bold">{filteredLogs.length}</span></li>
                      <li>• Filtro Actual: <span className="font-bold">{selectedOperator === 'all' ? 'Global' : selectedOperator}</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border-t p-4 flex justify-end shrink-0">
               <button onClick={() => setShowEngineeringModal(false)} className="text-slate-500 hover:text-slate-800 font-medium px-6">Volver al Dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
