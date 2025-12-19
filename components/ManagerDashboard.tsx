import React, { useEffect, useState } from 'react';
import { 
  getLogs, clearLogs, downloadCSV, downloadPDF, 
  getProductivityTarget, saveProductivityTarget, getOperators 
} from '../services/dataService';
import { analyzeProductionData } from '../services/geminiService';
import { ProductionLog, Sector } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Trash2, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, 
  Pencil, Save, Users, TrendingUp, Box, Lock, BrainCircuit, X, ShieldCheck, Trophy, Hash, Activity, Filter 
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
  const [rankingFilter, setRankingFilter] = useState<string>('Global');

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

  // En components/ManagerDashboard.tsx

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      // CAMBIO AQUÍ: Agregamos 'dailyTarget' al final de los argumentos
      const result = await analyzeProductionData(filteredLogs, allLogs, operatorList, selectedOperator, dailyTarget);
      setAnalysisResult(result);
    } catch (e) {
      setAnalysisResult("Error al generar análisis.");
    } finally {
      setIsAnalyzing(false);
    }
  
  };

  // --- CÁLCULOS PREVIOS (Necesarios para el PDF) ---
  const dailyTrend = Object.values(filteredLogs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; 
    const shortDate = new Date(log.timestamp).toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'});
    if (!acc[date]) acc[date] = { fullDate: date, name: shortDate, points: 0, quantity: 0 };
    acc[date].points += log.totalPoints;
    acc[date].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { fullDate:string, name: string; points: number; quantity: number }>))
  .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  // --- FUNCIÓN DE EXPORTACIÓN PDF ---
  const handleFullReportPDF = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // 1. PORTADA
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text(`Informe Técnico de Producción`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Empresa: TopSafe S.A. | Fecha de Emisión: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Período Analizado: ${startDate} al ${endDate}`, 14, 34);
    doc.text(`Alcance: ${selectedOperator === 'all' ? 'Planta Completa' : 'Operario: ' + selectedOperator}`, 14, 40);

    let currentY = 50;

    // SECCIÓN 1: ANÁLISIS IA
    if (analysisResult) {
      doc.setDrawColor(200);
      doc.line(14, 45, pageWidth - 14, 45);
      
      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text("1. Diagnóstico Inteligente", 14, currentY);
      currentY += 8;

      doc.setFontSize(10);
      doc.setTextColor(0);
      const cleanText = analysisResult.replace(/\*\*/g, '').replace(/###/g, '').replace(/•/g, '-');
      const splitText = doc.splitTextToSize(cleanText, 180);
      doc.text(splitText, 14, currentY);
      currentY += (splitText.length * 5) + 10;
    }

    // SECCIÓN 2: GRÁFICOS
    try {
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229);
      doc.text("2. Métricas Visuales", 14, 20);
      let chartY = 30;

      await new Promise(r => setTimeout(r, 500)); 

      const chartTrend = document.getElementById('chart-trend');
      if (chartTrend) {
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text("Evolución Diaria de Producción", 14, chartY);
        const canvas1 = await html2canvas(chartTrend, { scale: 2, backgroundColor: '#ffffff' });
        doc.addImage(canvas1.toDataURL('image/png'), 'PNG', 14, chartY + 5, 180, 70);
        chartY += 85;
      }

      const chartSector = document.getElementById('chart-sector');
      if (chartSector) {
        doc.text("Distribución por Sector", 14, chartY);
        const canvas2 = await html2canvas(chartSector, { scale: 2, backgroundColor: '#ffffff' });
        doc.addImage(canvas2.toDataURL('image/png'), 'PNG', 14, chartY + 5, 180, 70);
        chartY += 85;
      }

      const chartModels = document.getElementById('chart-models');
      if (chartModels) {
        if (chartY > 200) { doc.addPage(); chartY = 20; }
        doc.text("Top 5 Modelos Fabricados", 14, chartY);
        const canvas3 = await html2canvas(chartModels, { scale: 2, backgroundColor: '#ffffff' });
        doc.addImage(canvas3.toDataURL('image/png'), 'PNG', 14, chartY + 5, 180, 70);
      }

    } catch (e) { console.error("Error capturando gráficos:", e); }

    // SECCIÓN 3: TABLA DE EFICIENCIA DIARIA (NUEVO)
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229);
    doc.text("3. Resumen de Eficiencia Diaria", 14, 20);

    const efficiencyRows = dailyTrend.map(day => {
      const percentage = (day.points / dailyTarget) * 100;
      return [
        new Date(day.fullDate).toLocaleDateString(), // Fecha completa
        day.points.toLocaleString('es-AR'),          // Puntos con miles
        dailyTarget.toLocaleString('es-AR'),         // Meta
        percentage.toFixed(1) + '%'                  // Porcentaje
      ];
    });

    autoTable(doc, {
      startY: 25,
      head: [['Fecha', 'Puntos Realizados', 'Meta Estándar', '% Eficiencia']],
      body: efficiencyRows,
      theme: 'grid',
      headStyles: { fillColor: [50, 50, 50] },
      styles: { halign: 'center' },
      columnStyles: { 
        0: { halign: 'left' },
        3: { fontStyle: 'bold' } 
      }
    });

    // SECCIÓN 4: REGISTRO DETALLADO
    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229);
    // Usamos finalY de la tabla anterior para saber donde escribir, o agregamos pagina si falta espacio
    const finalY = (doc as any).lastAutoTable.finalY || 25;
    
    // Si queda poco espacio, saltamos pagina
    if (finalY > 250) {
       doc.addPage();
       doc.text("4. Registro Detallado de Operaciones", 14, 20);
    } else {
       doc.text("4. Registro Detallado de Operaciones", 14, finalY + 15);
    }

    autoTable(doc, {
      startY: finalY > 250 ? 25 : finalY + 20,
      head: [['Fecha', 'Orden', 'Operario', 'Sector', 'Modelo', 'Pts', 'Obs.']],
      body: filteredLogs.map(l => [
        new Date(l.timestamp).toLocaleDateString(),
        l.orderNumber || '-', 
        l.operatorName,
        l.sector,
        l.model,
        l.totalPoints.toFixed(1),
        l.comments ? l.comments.substring(0, 25) + '...' : '-'
      ]),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Reporte_Ingenieria_${new Date().toISOString().split('T')[0]}.pdf`);
    setIsGeneratingPDF(false);
  };

  // --- MÁS CÁLCULOS ---
  const rankingStats = Object.values(
    filteredLogs
      .filter(log => rankingFilter === 'Global' || log.sector === rankingFilter)
      .reduce((acc, log) => {
        if (!acc[log.operatorName]) {
          acc[log.operatorName] = { name: log.operatorName, points: 0, quantity: 0 };
        }
        acc[log.operatorName].points += log.totalPoints;
        acc[log.operatorName].quantity += log.quantity;
        return acc;
      }, {} as Record<string, { name: string; points: number; quantity: number }>)
  )
  .map(stat => ({ ...stat, percentage: (stat.points / dailyTarget) * 100 }))
  .sort((a, b) => b.points - a.points);

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 };
    acc[log.sector].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>));

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
             <button onClick={handleEngineeringAccess} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isAuthorized ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
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
        
        {/* PANEL RANKING / EFICIENCIA */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col h-96">
          {selectedOperator === 'all' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Ranking</h3>
                <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                  <Filter className="w-3 h-3 text-slate-500"/>
                  <select value={rankingFilter} onChange={(e) => setRankingFilter(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer">
                    <option value="Global">Global</option>
                    <option disabled>──────</option>
                    {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                 {rankingStats.length > 0 ? rankingStats.map((stat, idx) => (
                   <div key={stat.name} className="bg-slate-50 p-3 rounded-lg border border-slate-100 relative overflow-hidden">
                     {idx < 3 && <div className={`absolute top-0 right-0 p-1 px-2 text-[10px] font-bold text-white rounded-bl-lg ${idx===0?'bg-amber-400':(idx===1?'bg-slate-400':'bg-orange-400')}`}>#{idx+1}</div>}
                     <div className="flex justify-between items-center mb-1"><span className="font-bold text-slate-700">{stat.name}</span><span className="text-sm font-bold text-slate-600">{stat.points.toFixed(0)} pts</span></div>
                     <div className="w-full bg-slate-200 rounded-full h-2"><div className="h-full bg-amber-500" style={{ width: `${Math.min(stat.percentage, 100)}%` }}></div></div>
                   </div>
                 )) : <div className="text-center text-slate-400 py-10 italic">No hay datos en {rankingFilter}</div>}
              </div>
            </>
          ) : (
            <>
              <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600" /> Eficiencia Diaria</h3>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-right">Pts</th><th className="p-2 text-right">%</th></tr></thead>
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

        {/* GRAFICO TENDENCIA */}
        <div id="chart-trend" className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 lg:col-span-2`}>
          <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600"/> Evolución Diaria</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{fontSize: 12}} /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="points" name="Puntos" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} /><Line type="monotone" dataKey="quantity" name="Unidades" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" /></LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div id="chart-sector" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
          <h3 className="text-md font-bold text-slate-700 mb-4">Producción por Sector</h3>
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={countBySector} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">{countBySector.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </div>

        <div id="chart-models" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
          <h3 className="text-md font-semibold text-slate-700 mb-4">Top 5 Modelos</h3>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={modelStats} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false}/><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} /><Tooltip /><Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} name="Unidades" /></BarChart></ResponsiveContainer>
        </div>
      </div>

      {/* HISTORIAL DETALLADO */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-8">
         <div className="px-6 py-4 border-b border-slate-100 flex justify-between"><h3 className="font-semibold text-slate-800">Historial Detallado</h3><button onClick={handleClearData} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5"/></button></div>
         <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm text-left text-slate-600">
               <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                  <tr><th className="px-6 py-3">Fecha</th><th className="px-6 py-3">Orden</th><th className="px-6 py-3">Operario</th><th className="px-6 py-3">Sector</th><th className="px-6 py-3">Modelo</th><th className="px-6 py-3 text-right">Cant</th><th className="px-6 py-3 text-right">Pts</th><th className="px-6 py-3 w-48">Obs.</th></tr>
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
                        <td className="px-6 py-4 text-xs text-slate-500 max-w-[150px] truncate" title={log.comments}>{log.comments || '-'}</td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

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
                    <p className="text-sm text-slate-500 mb-6">Genera un documento oficial incluyendo el análisis de IA, gráficos estadísticos y tablas de datos completos.</p>
                    <button onClick={handleFullReportPDF} disabled={isGeneratingPDF} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] disabled:opacity-50">
                      {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin"/> : <FileText className="w-5 h-5" />} {isGeneratingPDF ? 'GENERANDO...' : 'DESCARGAR REPORTE COMPLETO'}
                    </button>
                  </div>
                  <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                    <h4 className="font-bold text-indigo-900 mb-2">Estado del Sistema</h4>
                    <ul className="text-sm space-y-2 text-indigo-800"><li>• Motor de Análisis: <span className="font-bold text-green-600">Local v2.0</span></li><li>• Registros Analizados: <span className="font-bold">{filteredLogs.length}</span></li><li>• Filtro Actual: <span className="font-bold">{selectedOperator === 'all' ? 'Global' : selectedOperator}</span></li></ul>
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
