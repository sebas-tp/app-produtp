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
  Timer, Layers, LayoutList, Scale, AlertOctagon, Briefcase, Calculator // <--- NUEVOS ICONOS
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

export const ManagerDashboard: React.FC = () => {
  // --- ESTADOS DE DATOS ---
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- NAVEGACIÓN (AHORA 4 PESTAÑAS) ---
  const [activeTab, setActiveTab] = useState<'metrics' | 'efficiency' | 'audit' | 'accounting'>('metrics');

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

  // --- CONFIG EFICIENCIA ---
  const [globalDays, setGlobalDays] = useState<number>(20); 
  const [shiftHours, setShiftHours] = useState<number>(8.5);
  const [pointsPerHour, setPointsPerHour] = useState<number>(3600);
  const [customDays, setCustomDays] = useState<Record<string, number>>({});
  const [efficiencyView, setEfficiencyView] = useState<'operator' | 'sector'>('operator');
  
  // --- INPUTS TANGO (AUDITORÍA) ---
  const [tangoInputs, setTangoInputs] = useState<Record<string, string>>({});

  // --- SEGURIDAD ---
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showEngineeringModal, setShowEngineeringModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const MASTER_PASSWORD = "admin";

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

  // --- CÁLCULOS 1: MÉTRICAS ---
  const dailyTrend = Object.values(filteredLogs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; 
    const shortDate = new Date(log.timestamp).toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'});
    if (!acc[date]) acc[date] = { fullDate: date, name: shortDate, points: 0, quantity: 0 };
    acc[date].points += log.totalPoints;
    acc[date].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { fullDate:string, name: string; points: number; quantity: number }>))
  .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  const rankingStatsForMetrics = Object.values(filteredLogs.filter(log => rankingFilter === 'Global' || log.sector === rankingFilter).reduce((acc, log) => {
    if (!acc[log.operatorName]) acc[log.operatorName] = { name: log.operatorName, points: 0, quantity: 0 };
    acc[log.operatorName].points += log.totalPoints; acc[log.operatorName].quantity += log.quantity; return acc;
  }, {} as Record<string, { name: string; points: number; quantity: number }>)).map(stat => ({ ...stat, percentage: (stat.points / dailyTarget) * 100 })).sort((a, b) => b.points - a.points);

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 }; acc[log.sector].value += log.quantity; return acc;
  }, {} as Record<string, { name: string; value: number }>));

  const modelStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.model]) acc[log.model] = { name: log.model, value: 0 }; acc[log.model].value += log.quantity; return acc;
  }, {} as Record<string, { name: string; value: number }>)).sort((a, b) => b.value - a.value).slice(0, 5);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

  // --- CÁLCULOS 2: EFICIENCIA ---
  const getEfficiencyData = () => {
    const opStats = Object.values(filteredLogs.reduce((acc, log) => {
        if (!acc[log.operatorName]) {
            acc[log.operatorName] = { name: log.operatorName, sector: log.sector || 'General', points: 0 };
        }
        acc[log.operatorName].points += log.totalPoints;
        // Lógica de sector dominante: Simplemente tomamos el último registrado o predominante
        // Para más precisión, en un sistema real se contaría cuál sector aparece más veces.
        return acc;
    }, {} as Record<string, { name: string; sector: string; points: number }>));

    const detailedStats = opStats.map(stat => {
        const daysWorked = customDays[stat.name] !== undefined ? customDays[stat.name] : globalDays;
        const potentialPoints = daysWorked * shiftHours * pointsPerHour;
        const difference = stat.points - potentialPoints;
        const performancePct = potentialPoints > 0 ? (stat.points / potentialPoints) * 100 : 0;
        return { ...stat, daysWorked, potentialPoints, difference, performancePct, isSurplus: difference >= 0 };
    });

    if (efficiencyView === 'sector') {
        const sectorStats = detailedStats.reduce((acc, stat) => {
            if (!acc[stat.sector]) acc[stat.sector] = { name: stat.sector, count: 0, points: 0, potentialPoints: 0 };
            acc[stat.sector].count += 1;
            acc[stat.sector].points += stat.points;
            acc[stat.sector].potentialPoints += stat.potentialPoints;
            return acc;
        }, {} as Record<string, any>);

        return Object.values(sectorStats).map((sec: any) => {
            const difference = sec.points - sec.potentialPoints;
            return {
                name: sec.name, operatorsCount: sec.count, points: sec.points, potentialPoints: sec.potentialPoints,
                difference, isSurplus: difference >= 0, performancePct: sec.potentialPoints > 0 ? (sec.points / sec.potentialPoints) * 100 : 0
            };
        }).sort((a, b) => b.performancePct - a.performancePct);
    }
    return detailedStats.sort((a, b) => b.performancePct - a.performancePct);
  };

  // --- CÁLCULOS 3: AUDITORÍA (TANGO) ---
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

  // --- CÁLCULOS 4: CONTABILIDAD (NUEVO) ---
  const getAccountingData = () => {
    // A. Detectar Sector de cada Operario (Basado en dónde produjeron más)
    const operatorSectorMap: Record<string, string> = {};
    const opPointsPerSector: Record<string, Record<string, number>> = {};

    filteredLogs.forEach(log => {
        if (!opPointsPerSector[log.operatorName]) opPointsPerSector[log.operatorName] = {};
        if (!opPointsPerSector[log.operatorName][log.sector]) opPointsPerSector[log.operatorName][log.sector] = 0;
        opPointsPerSector[log.operatorName][log.sector] += log.totalPoints;
    });

    Object.keys(opPointsPerSector).forEach(op => {
        // Encontrar sector con más puntos
        const sectors = opPointsPerSector[op];
        const bestSector = Object.keys(sectors).reduce((a, b) => sectors[a] > sectors[b] ? a : b);
        operatorSectorMap[op] = bestSector;
    });

    // B. Calcular Capacidad Instalada por Centro de Costo (Sector)
    const sectorCapacity: Record<string, { capacity: number, headcount: number }> = {};
    
    // Obtenemos la lista de operarios únicos del periodo y sus días trabajados
    Object.keys(operatorSectorMap).forEach(op => {
        const sector = operatorSectorMap[op];
        const days = customDays[op] !== undefined ? customDays[op] : globalDays;
        const capacity = days * shiftHours * pointsPerHour;

        if (!sectorCapacity[sector]) sectorCapacity[sector] = { capacity: 0, headcount: 0 };
        sectorCapacity[sector].capacity += capacity;
        sectorCapacity[sector].headcount += 1;
    });

    // C. Calcular Producción Real Validada (Tango) distribuida por Sector
    const sectorRealProd: Record<string, number> = {};
    
    // Recorremos los inputs de Tango (Modelos y Cantidades)
    Object.keys(tangoInputs).forEach(model => {
        const qty = parseInt(tangoInputs[model] || '0');
        if (qty > 0) {
            // Buscamos en la matriz cómo se compone ese modelo
            const rules = matrix.filter(r => r.model === model);
            rules.forEach(rule => {
                const sector = rule.sector;
                const points = rule.pointsPerUnit * qty;
                
                if (!sectorRealProd[sector]) sectorRealProd[sector] = 0;
                sectorRealProd[sector] += points;
            });
        }
    });

    // D. Unificar todo en la tabla final
    // Usamos los sectores definidos en el enum Sector o los que aparezcan
    const allSectors = Array.from(new Set([...Object.keys(sectorCapacity), ...Object.keys(sectorRealProd)]));
    
    const accountingRows = allSectors.map(sector => {
        const cap = sectorCapacity[sector]?.capacity || 0;
        const real = sectorRealProd[sector] || 0;
        const headcount = sectorCapacity[sector]?.headcount || 0;
        const productivity = cap > 0 ? (real / cap) * 100 : 0;

        return {
            sector,
            headcount,
            capacity: cap,
            realProduction: real,
            productivity
        };
    });

    // Agregar Fila Total
    const totalRow = accountingRows.reduce((acc, row) => ({
        sector: 'TOTAL PLANTA',
        headcount: acc.headcount + row.headcount,
        capacity: acc.capacity + row.capacity,
        realProduction: acc.realProduction + row.realProduction,
        productivity: 0 // Se recalcula
    }), { sector: 'TOTAL', headcount: 0, capacity: 0, realProduction: 0, productivity: 0 });
    
    totalRow.productivity = totalRow.capacity > 0 ? (totalRow.realProduction / totalRow.capacity) * 100 : 0;

    return [...accountingRows, totalRow];
  };

  // --- VARIABLES DE CÁLCULO ---
  const auditData = getAuditData();
  const efficiencyData = getEfficiencyData();
  const accountingData = getAccountingData();

  // Para la tarjeta de Métricas (Real Tango)
  const totalTangoPoints = auditData.reduce((sum, item) => sum + item.theoreticalPoints, 0);
  const totalDeclaredPoints = filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0);
  const globalDifference = totalDeclaredPoints - totalTangoPoints;

  // --- HANDLERS ---
  const handleSaveTarget = async () => {
    const newVal = parseInt(tempTarget);
    if (!isNaN(newVal) && newVal > 0) { await saveProductivityTarget(newVal); setDailyTarget(newVal); setIsEditingTarget(false); refreshData(); }
  };
  const handleClearData = async () => { if (window.confirm("¡PELIGRO! ¿Borrar historial?")) { setLoading(true); await clearLogs(); await refreshData(); }};
  const handleEngineeringAccess = () => { if (isAuthorized) openEngineeringModal(); else setShowAuthModal(true); };
  const verifyPassword = (e: React.FormEvent) => { e.preventDefault(); if (passwordInput === MASTER_PASSWORD) { setIsAuthorized(true); setShowAuthModal(false); setPasswordInput(''); openEngineeringModal(); } else { alert("Acceso denegado."); }};
  const openEngineeringModal = async () => { setShowEngineeringModal(true); if (!analysisResult) runAnalysis(); };
  const runAnalysis = async () => { setIsAnalyzing(true); try { const result = await analyzeProductionData(filteredLogs, allLogs, operatorList, selectedOperator, dailyTarget); setAnalysisResult(result); } catch (e) { setAnalysisResult("Error al generar análisis."); } finally { setIsAnalyzing(false); }};

  // --- EXPORTADORES ---
  const generateGenericCSV = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSmartExcel = () => {
    if (activeTab === 'metrics') {
        downloadCSV(filteredLogs, `Reporte_Metricas_${startDate}`);
    } else if (activeTab === 'efficiency') {
        const data = getEfficiencyData(); // Usamos la función pura dependiendo de la vista
        // Lógica simplificada para exportar lo que se ve
        const rows = data.map((d: any) => [d.name, d.points.toFixed(2)]); // Simplificado para ejemplo
        generateGenericCSV(["Nombre", "Puntos"], rows, `Reporte_Eficiencia_${startDate}`);
    } else if (activeTab === 'audit') {
        const rows = auditData.map(d => [d.model, d.tangoQty, d.difference]);
        generateGenericCSV(["Modelo", "Tango", "Desvio"], rows, `Reporte_Auditoria_${startDate}`);
    } else if (activeTab === 'accounting') {
        const rows = accountingData.map(d => [d.sector, d.headcount, d.capacity, d.realProduction, d.productivity.toFixed(2) + '%']);
        generateGenericCSV(["Centro Costo", "Operarios", "Capacidad", "Real (Tango)", "Productividad"], rows, `Reporte_Contable_${startDate}`);
    }
  };

  const handleSmartPDF = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text(`Informe Técnico`, 14, 20);
    doc.setFontSize(10); doc.text(`TopSafe S.A. | ${startDate} al ${endDate}`, 14, 28);

    if (activeTab === 'audit') {
        doc.text("AUDITORÍA STOCK", 14, 45);
        autoTable(doc, { startY: 50, head: [['Modelo', 'Valor Std', 'Tango', 'Teórico', 'Declarado', 'Desvío', 'Estado']], body: auditData.map(d => [d.model, d.standardValue.toFixed(1), d.tangoQty, d.theoreticalPoints.toFixed(0), d.declaredPoints.toFixed(0), d.difference.toFixed(0), Math.abs(d.deviationPct)<5?"OK":"REV"]) });
    } else if (activeTab === 'efficiency') {
        doc.text("EFICIENCIA Y OCIO", 14, 45);
        const data = efficiencyView === 'sector' ? getEfficiencyData() : getEfficiencyData(); // Simplificación
        // Aquí iría la lógica completa de tabla PDF similar a la renderizada
        doc.text("Ver dashboard para detalle interactivo.", 14, 55);
    } else if (activeTab === 'accounting') {
        doc.text("REPORTE DE PRODUCTIVIDAD (CONTABLE)", 14, 45);
        doc.text("Comparativa: Capacidad Instalada vs. Producción Validada por Tango", 14, 52);
        autoTable(doc, {
            startY: 60,
            head: [['Centro de Costo', 'Cant. Op', 'Capacidad (Pts)', 'Prod. Real (Pts)', 'Productividad']],
            body: accountingData.map(r => [
                r.sector, 
                r.sector === 'TOTAL PLANTA' ? '-' : r.headcount, 
                r.capacity.toLocaleString('es-AR'), 
                r.realProduction.toLocaleString('es-AR'), 
                { content: r.productivity.toFixed(1) + '%', styles: { fontStyle: 'bold', textColor: r.productivity < 50 ? [220,38,38] : [22,163,74] } }
            ]),
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] } // Indigo
        });
        doc.text("* La 'Prod. Real' se calcula distribuyendo los ingresos de Tango según la Matriz de Puntos.", 14, (doc as any).lastAutoTable.finalY + 10);
    } else {
        doc.text("Métricas Generales", 14, 45);
        autoTable(doc, { startY: 50, head: [['Fecha', 'Operario', 'Modelo', 'Cant', 'Pts', 'Obs']], body: filteredLogs.slice(0, 100).map(l => [new Date(l.timestamp).toLocaleDateString(), l.operatorName, l.model, l.quantity, l.totalPoints.toFixed(1), l.comments||'-']) });
    }
    doc.save(`Reporte_${activeTab}.pdf`); setIsGeneratingPDF(false);
  };

  const handleFullEngineeringReport = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text(`Informe Ingeniería`, 14, 20);
    if(analysisResult) { doc.setFontSize(10); doc.text(doc.splitTextToSize(analysisResult.replace(/\*\*/g, ''), 180), 14, 40); }
    doc.save(`Analisis_Ing.pdf`); setIsGeneratingPDF(false);
  }

  if (loading && allLogs.length === 0) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  return (
    <div className="space-y-6 p-4 md:p-8 pb-20">
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h2>
           {/* PESTAÑAS */}
           <div className="flex gap-2 mt-2 bg-slate-100 p-1 rounded-full w-fit flex-wrap">
             <button onClick={() => setActiveTab('metrics')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'metrics' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Métricas</button>
             <button onClick={() => setActiveTab('efficiency')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'efficiency' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Eficiencia</button>
             <button onClick={() => setActiveTab('audit')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'audit' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Auditoría</button>
             <button onClick={() => setActiveTab('accounting')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'accounting' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Contabilidad</button>
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
                <button onClick={handleSmartExcel} className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200" title="Excel"><FileDown className="w-5 h-5" /></button>
                <button onClick={handleSmartPDF} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" title="PDF"><FileText className="w-5 h-5" /></button>
                <button onClick={refreshData} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><RefreshCw className="w-5 h-5" /></button>
                <div className="h-8 w-px bg-slate-300 mx-1"></div>
                <button onClick={handleEngineeringAccess} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isAuthorized ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {isAuthorized ? <BrainCircuit className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>

      {/* PESTAÑA 1: MÉTRICAS */}
      {activeTab === 'metrics' && (
        <div className="space-y-6 animate-in fade-in">
            {/* KPI CARDS REDISEÑADAS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl shadow-md border border-slate-700 text-white md:col-span-1">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Target className="w-4 h-4 text-amber-500" /> Meta Diaria</p>
                        {!isEditingTarget ? <button onClick={() => setIsEditingTarget(true)}><Pencil className="w-4 h-4 text-slate-400 hover:text-white" /></button> : <button onClick={handleSaveTarget}><Save className="w-4 h-4 text-emerald-400" /></button>}
                    </div>
                    {isEditingTarget ? <input type="number" value={tempTarget} onChange={(e) => setTempTarget(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xl font-bold w-full text-white" autoFocus /> : <p className="text-3xl font-black mt-1 tracking-tight">{dailyTarget.toLocaleString()} <span className="text-sm font-normal text-slate-400">pts</span></p>}
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-2"><Box className="w-4 h-4 text-blue-500"/> Declarado (App)</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{totalDeclaredPoints.toLocaleString('es-AR', {maximumFractionDigits:0})}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500">
                    <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-2"><Scale className="w-4 h-4 text-indigo-500"/> Real (Tango)</p>
                    <p className="text-3xl font-bold text-indigo-700 mt-2">{totalTangoPoints.toLocaleString('es-AR', {maximumFractionDigits:0})}</p>
                </div>
                <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 ${globalDifference >= 0 ? 'border-red-500' : 'border-green-500'}`}>
                    <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-2">Balance</p>
                    <p className={`text-3xl font-bold mt-2 ${globalDifference >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {globalDifference > 0 ? '+' : ''}{globalDifference.toLocaleString('es-AR', {maximumFractionDigits:0})}
                    </p>
                </div>
            </div>

            {/* GRÁFICOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col h-96">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Ranking</h3>
                        <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                            <Filter className="w-3 h-3 text-slate-500"/>
                            <select value={rankingFilter} onChange={(e) => setRankingFilter(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"><option value="Global">Global</option><option disabled>──────</option>{Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}</select>
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                        {rankingStatsForMetrics.map((stat, idx) => (
                        <div key={stat.name} className="bg-slate-50 p-3 rounded-lg border border-slate-100 relative overflow-hidden">
                            {idx < 3 && <div className={`absolute top-0 right-0 p-1 px-2 text-[10px] font-bold text-white rounded-bl-lg ${idx===0?'bg-amber-400':(idx===1?'bg-slate-400':'bg-orange-400')}`}>#{idx+1}</div>}
                            <div className="flex justify-between items-center mb-1"><span className="font-bold text-slate-700">{stat.name}</span><span className="text-sm font-bold text-slate-600">{stat.points.toFixed(0)} pts</span></div>
                            <div className="w-full bg-slate-200 rounded-full h-2"><div className="h-full bg-amber-500" style={{ width: `${Math.min(stat.percentage, 100)}%` }}></div></div>
                        </div>
                        ))}
                    </div>
                </div>
                <div id="chart-trend" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 lg:col-span-2">
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
            
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-8">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between"><h3 className="font-semibold text-slate-800">Historial Detallado</h3><button onClick={handleClearData} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5"/></button></div>
                <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0"><tr><th className="px-6 py-3">Fecha</th><th className="px-6 py-3">Operario</th><th className="px-6 py-3">Modelo</th><th className="px-6 py-3 text-right">Pts</th><th className="px-6 py-3 w-48">Obs.</th></tr></thead>
                        <tbody>
                            {filteredLogs.slice(0, 100).map(log => (
                                <tr key={log.id} className="border-b hover:bg-slate-50">
                                    <td className="px-6 py-4">{new Date(log.timestamp).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 font-bold">{log.operatorName}</td>
                                    <td className="px-6 py-4">{log.model}</td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-600">{log.totalPoints.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500" title={log.comments}>{log.comments || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* PESTAÑA 2: EFICIENCIA */}
      {activeTab === 'efficiency' && (
         <div className="animate-in fade-in space-y-6">
            <div className="bg-indigo-50 p-6 rounded-xl shadow-md border-l-4 border-indigo-600">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Timer className="w-6 h-6 text-indigo-600"/> Eficiencia de Planta</h3>
                        <p className="text-slate-600 text-sm mt-1">Detección de superávit de producción y tiempo ocioso.</p>
                    </div>
                    <div className="bg-white p-1 rounded-lg border border-indigo-100 flex">
                        <button onClick={() => setEfficiencyView('operator')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${efficiencyView === 'operator' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutList className="w-4 h-4 inline mr-1"/> Detalle</button>
                        <button onClick={() => setEfficiencyView('sector')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${efficiencyView === 'sector' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><Layers className="w-4 h-4 inline mr-1"/> Resumen</button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border border-indigo-100 mt-4 items-end">
                     <div><label className="text-[10px] text-indigo-500 font-bold block mb-1">DÍAS ESTÁNDAR</label><input type="number" value={globalDays} onChange={e => setGlobalDays(Number(e.target.value))} className="w-24 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-lg font-bold text-slate-800 outline-none"/></div>
                     <div><label className="text-[10px] text-indigo-500 font-bold block mb-1">HORAS TURNO</label><input type="number" value={shiftHours} onChange={e => setShiftHours(Number(e.target.value))} className="w-24 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-lg font-bold text-slate-800 outline-none"/></div>
                     <div><label className="text-[10px] text-slate-400 font-bold block mb-1">CAPACIDAD BASE</label><div className="bg-indigo-100 px-4 py-2 rounded text-lg font-black text-indigo-700 border border-indigo-200">{(globalDays * shiftHours * pointsPerHour).toLocaleString()} pts</div></div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-700">Reporte de Desempeño</h3></div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                            <tr>
                                <th className="px-6 py-4">{efficiencyView === 'operator' ? 'Operario' : 'Sector'}</th>
                                {efficiencyView === 'operator' && <th className="px-6 py-4 text-center">Días Trab.</th>}
                                {efficiencyView === 'sector' && <th className="px-6 py-4 text-center">Cant. Op.</th>}
                                <th className="px-6 py-4 text-right">Real (Pts)</th>
                                <th className="px-6 py-4 text-right text-indigo-600">Capacidad</th>
                                <th className="px-6 py-4 text-right font-bold">Balance</th>
                                <th className="px-6 py-4 text-center">Rendimiento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {getEfficiencyData().map((stat:any, idx: number) => (
                                <tr key={stat.name} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-2">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white ${idx<3 ? 'bg-indigo-500' : 'bg-slate-400'}`}>{idx+1}</div>
                                        {stat.name}
                                    </td>
                                    {efficiencyView === 'operator' && (
                                        <td className="px-6 py-4 text-center">
                                            <input type="number" className="w-16 text-center border border-slate-200 rounded bg-slate-50 font-bold text-slate-700" value={stat.daysWorked} onChange={(e) => setCustomDays({ ...customDays, [stat.name]: Number(e.target.value) })}/>
                                        </td>
                                    )}
                                    {efficiencyView === 'sector' && <td className="px-6 py-4 text-center font-mono text-slate-500">{stat.operatorsCount}</td>}
                                    <td className="px-6 py-4 text-right font-medium">{stat.points.toLocaleString('es-AR')}</td>
                                    <td className="px-6 py-4 text-right text-indigo-600 bg-indigo-50/30 font-mono">{stat.potentialPoints.toLocaleString('es-AR')}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${stat.isSurplus ? 'text-green-600 bg-green-50/30' : 'text-red-600 bg-red-50/30'}`}>{stat.isSurplus ? '+' : ''}{stat.difference.toLocaleString('es-AR')}</td>
                                    <td className="px-6 py-4 text-center">{stat.isSurplus ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">SUPERÁVIT</span> : <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold border border-red-200">DÉFICIT {(100 - stat.performancePct).toFixed(0)}%</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>
         </div>
      )}

      {/* PESTAÑA 3: AUDITORÍA */}
      {activeTab === 'audit' && (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Scale className="w-6 h-6 text-red-600"/> Conciliación vs. Tango / Stock</h3>
                <p className="text-slate-500 text-sm mt-1">Carga aquí los ingresos de stock para validar la producción.</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 uppercase text-xs font-bold border-b border-slate-200">
                            <tr><th className="px-6 py-4">Modelo</th><th className="px-6 py-4 text-right bg-blue-50/50">Valor Std</th><th className="px-6 py-4 text-right bg-blue-50/50">Declarado</th><th className="px-6 py-4 text-center bg-red-50/50 w-48">Cant. Real (Tango)</th><th className="px-6 py-4 text-right bg-red-50/50">Teórico</th><th className="px-6 py-4 text-right">Desvío</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {getAuditData().map((row) => (
                                <tr key={row.model} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-800">{row.model}</td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 bg-blue-50/30">{row.standardValue.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-600 bg-blue-50/30">{row.declaredPoints.toLocaleString()}</td>
                                    <td className="px-6 py-4 bg-red-50/30"><div className="flex items-center justify-center"><input type="number" className="w-24 border border-red-200 rounded p-1 text-center font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-500" placeholder="0" value={tangoInputs[row.model] || ''} onChange={(e) => setTangoInputs({...tangoInputs, [row.model]: e.target.value})}/><span className="text-xs text-slate-400 ml-1">u.</span></div></td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 bg-red-50/30">{row.theoreticalPoints.toLocaleString()}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${row.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>{row.difference > 0 ? '+' : ''}{row.difference.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* PESTAÑA 4: CONTABILIDAD (NUEVO) */}
      {activeTab === 'accounting' && (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-emerald-50 p-6 rounded-xl shadow-md border-l-4 border-emerald-600">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Briefcase className="w-6 h-6 text-emerald-600"/> Reporte de Productividad (Contable)</h3>
                <p className="text-slate-600 text-sm mt-1">Comparativa de Capacidad Instalada vs. Producción Validada por Centro de Costo.</p>
                <div className="mt-4 flex gap-4 text-xs">
                    <div className="bg-white px-3 py-1 rounded border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1"><Calculator className="w-3 h-3"/> Datos basados en Auditoría Tango</div>
                    <div className="bg-white px-3 py-1 rounded border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1"><Users className="w-3 h-3"/> Asignación automática de personal</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                        <tr>
                            <th className="px-6 py-4">Centro de Costo</th>
                            <th className="px-6 py-4 text-center">Cant. Op.</th>
                            <th className="px-6 py-4 text-right text-slate-500">Capacidad (Pts)</th>
                            <th className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/50">Prod. Real (Tango)</th>
                            <th className="px-6 py-4 text-right font-bold">Productividad</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {getAccountingData().map((row, idx) => (
                            <tr key={row.sector} className={row.sector.includes('TOTAL') ? "bg-slate-100 font-bold border-t-2 border-slate-300" : "hover:bg-slate-50"}>
                                <td className="px-6 py-4 font-bold text-slate-800">{row.sector}</td>
                                <td className="px-6 py-4 text-center">{row.sector.includes('TOTAL') ? '-' : row.headcount}</td>
                                <td className="px-6 py-4 text-right text-slate-500 font-mono">{row.capacity.toLocaleString('es-AR')}</td>
                                <td className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/30 font-mono font-bold">{row.realProduction.toLocaleString('es-AR')}</td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${row.productivity < 50 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {row.productivity.toFixed(1)}%
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* MODALES (Ingeniería y Auth) se mantienen igual */}
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
                    <button onClick={handleFullEngineeringReport} disabled={isGeneratingPDF} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] disabled:opacity-50">
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
