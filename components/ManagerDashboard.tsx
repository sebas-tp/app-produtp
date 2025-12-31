import React, { useEffect, useState } from 'react';
import { 
  getLogs, clearLogs, downloadCSV, downloadPDF, 
  getProductivityTarget, saveProductivityTarget, getOperators,
  getPointsMatrix, fixDatabaseData // <--- Importado
} from '../services/dataService';
import { analyzeProductionData } from '../services/geminiService';
import { ProductionLog, Sector, PointRule } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Trash2, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, 
  Pencil, Save, Users, TrendingUp, Box, Lock, BrainCircuit, X, ShieldCheck, Trophy, Hash, Activity, Filter,
  Timer, Layers, LayoutList, Scale, AlertOctagon, Briefcase, Calculator, ChevronDown, ChevronRight, CheckCircle2, Info, Search, Zap, AlertTriangle, PenTool, Database
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
  
  // --- NAVEGACIÓN ---
  const [activeTab, setActiveTab] = useState<'metrics' | 'efficiency' | 'audit' | 'accounting' | 'simulator'>('metrics');

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
  
  // --- INPUTS TANGO & AUDITORÍA ---
  const [tangoInputs, setTangoInputs] = useState<Record<string, string>>({});
  const [auditSearch, setAuditSearch] = useState('');

  // --- INPUTS SIMULADOR ---
  const [simModel, setSimModel] = useState<string>('');
  const [simQty, setSimQty] = useState<number>(100);
  const [simResources, setSimResources] = useState<Record<string, number>>({
      'CORTE': 2, 'COSTURA': 5, 'ARMADO': 4, 'EMBALAJE': 2
  });

  // --- ESTADO PARA ACORDEÓN CONTABLE ---
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

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
    const initCatalogs = async () => {
      try {
        const [target, ops, mtx] = await Promise.all([
          getProductivityTarget(), 
          getOperators(), 
          getPointsMatrix() // Usa caché por defecto
        ]);
        setDailyTarget(target || 24960);
        setTempTarget((target || 24960).toString());
        setOperatorList(ops);
        setMatrix(mtx);
      } catch (e) { console.error(e); }
    };
    initCatalogs();
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const logs = await getLogs(startDate, endDate);
        setAllLogs(logs);
        if (selectedOperator === 'all') {
            setFilteredLogs(logs);
        } else {
            setFilteredLogs(logs.filter(l => l.operatorName === selectedOperator));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchLogs();
  }, [startDate, endDate]); 

  useEffect(() => {
      if (selectedOperator === 'all') {
          setFilteredLogs(allLogs);
      } else {
          setFilteredLogs(allLogs.filter(l => l.operatorName === selectedOperator));
      }
  }, [selectedOperator, allLogs]);

  const refreshData = async () => {
    setLoading(true);
    // FORZAMOS LA DESCARGA CON 'true'
    const [logs, mtx] = await Promise.all([
        getLogs(startDate, endDate), 
        getPointsMatrix(true) 
    ]);
    setAllLogs(logs);
    setMatrix(mtx);
    if (selectedOperator === 'all') setFilteredLogs(logs);
    else setFilteredLogs(logs.filter(l => l.operatorName === selectedOperator));
    setLoading(false);
  };

  // --- CÁLCULOS (Mismos de siempre) ---
  const normalizeCostCenter = (sectorName: string) => {
    const s = sectorName.toUpperCase();
    if (s.includes('CORTE')) return 'CORTE';
    if (s.includes('COSTURA')) return 'COSTURA';
    if (s.includes('ARMADO') || s.includes('APARADO')) return 'ARMADO';
    if (s.includes('EMBALAJE') || s.includes('LIMPIEZA') || s.includes('EMPAQUE')) return 'EMBALAJE';
    return 'OTROS';
  };

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

  const getEfficiencyData = () => {
    const opStats = Object.values(filteredLogs.reduce((acc, log) => {
        if (!acc[log.operatorName]) {
            acc[log.operatorName] = { name: log.operatorName, sector: log.sector || 'General', points: 0 };
        }
        acc[log.operatorName].points += log.totalPoints;
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

  const getAccountingData = () => {
    const opSectorMap: Record<string, string> = {};
    const opPoints: Record<string, number> = {};
    const opPointsPerRawSector: Record<string, Record<string, number>> = {};

    filteredLogs.forEach(log => {
        if (!opPointsPerRawSector[log.operatorName]) opPointsPerRawSector[log.operatorName] = {};
        if (!opPointsPerRawSector[log.operatorName][log.sector]) opPointsPerRawSector[log.operatorName][log.sector] = 0;
        opPointsPerRawSector[log.operatorName][log.sector] += log.totalPoints;
        if (!opPoints[log.operatorName]) opPoints[log.operatorName] = 0;
        opPoints[log.operatorName] += log.totalPoints;
    });

    Object.keys(opPointsPerRawSector).forEach(op => {
        const sectors = opPointsPerRawSector[op];
        const bestRawSector = Object.keys(sectors).reduce((a, b) => sectors[a] > sectors[b] ? a : b);
        opSectorMap[op] = normalizeCostCenter(bestRawSector);
    });

    const sectorRealProd: Record<string, number> = { 'CORTE':0, 'COSTURA':0, 'ARMADO':0, 'EMBALAJE':0, 'OTROS':0 };
    Object.keys(tangoInputs).forEach(model => {
        const qty = parseInt(tangoInputs[model] || '0');
        if (qty > 0) {
            const rules = matrix.filter(r => r.model === model);
            rules.forEach(rule => {
                const cc = normalizeCostCenter(rule.sector);
                sectorRealProd[cc] += (rule.pointsPerUnit * qty);
            });
        }
    });

    const costCenters = ['CORTE', 'COSTURA', 'ARMADO', 'EMBALAJE'];
    
    return costCenters.map(cc => {
        const operatorsInCC = Object.keys(opSectorMap).filter(op => opSectorMap[op] === cc);
        let totalCapacity = 0;
        let totalDeclared = 0;
        const operatorDetails = operatorsInCC.map(op => {
            const days = customDays[op] !== undefined ? customDays[op] : globalDays;
            const capacity = days * shiftHours * pointsPerHour;
            const declared = opPoints[op] || 0;
            totalCapacity += capacity;
            totalDeclared += declared;
            return { name: op, capacity, declared, efficiency: capacity > 0 ? (declared/capacity)*100 : 0 };
        });
        const realProduction = sectorRealProd[cc] || 0;
        const productivity = totalCapacity > 0 ? (realProduction / totalCapacity) * 100 : 0;
        return {
            center: cc, headcount: operatorsInCC.length, capacity: totalCapacity, declared: totalDeclared,
            real: realProduction, productivity, operators: operatorDetails
        };
    });
  };

  const getSimulationData = () => {
    if (!simModel || simQty <= 0) return [];
    const rules = matrix.filter(r => r.model === simModel);
    const loadPerSector: Record<string, number> = { 'CORTE':0, 'COSTURA':0, 'ARMADO':0, 'EMBALAJE':0 };
    rules.forEach(r => {
        const cc = normalizeCostCenter(r.sector);
        if (loadPerSector[cc] !== undefined) loadPerSector[cc] += (r.pointsPerUnit * simQty);
    });
    const singlePersonCapacity = dailyTarget;
    
    return Object.entries(loadPerSector).map(([sector, points]) => {
        const peopleNeeded = points / singlePersonCapacity;
        const peopleRounded = Math.ceil(peopleNeeded);
        const availableResources = simResources[sector] || 0;
        const isBottleneck = peopleRounded > availableResources;
        return { 
            sector, 
            pointsRequired: points, 
            peopleNeeded, 
            peopleRounded, 
            availableResources, 
            isBottleneck 
        };
    });
  };

  const auditData = getAuditData();
  const efficiencyData = getEfficiencyData();
  const accountingData = getAccountingData();
  const simulationData = getSimulationData(); 

  const uniqueModels = Array.from(new Set(matrix.map(m => m.model))).sort();
  const visibleAuditData = auditData.filter(item => item.model.toLowerCase().includes(auditSearch.toLowerCase()));

  const totalTangoPoints = auditData.reduce((sum, item) => sum + item.theoreticalPoints, 0);
  const totalDeclaredPoints = filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0);
  const isGlobalView = selectedOperator === 'all';
  const globalDifference = isGlobalView ? (totalDeclaredPoints - totalTangoPoints) : 0;

  const totalPlantCapacity = accountingData.reduce((sum, item) => sum + item.capacity, 0);
  const totalPlantReal = accountingData.reduce((sum, item) => sum + item.real, 0);
  const plantProductivity = totalPlantCapacity > 0 ? (totalPlantReal / totalPlantCapacity) * 100 : 0;

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
        const data = getEfficiencyData(); 
        const rows = data.map((d: any) => [d.name, d.daysWorked || '-', d.points.toFixed(2), d.potentialPoints.toFixed(2), d.difference.toFixed(2), d.isSurplus ? "Superavit" : "Deficit"]);
        generateGenericCSV(["Nombre", "Dias Trab", "Pts Real", "Pts Potencial", "Diferencia", "Estado"], rows, `Reporte_Eficiencia_${startDate}`);
    } else if (activeTab === 'audit') {
        const rows = auditData.map(d => [d.model, d.tangoQty, d.difference]);
        generateGenericCSV(["Modelo", "Tango", "Desvio"], rows, `Reporte_Auditoria_${startDate}`);
    } else if (activeTab === 'accounting') {
        const rows = accountingData.map(d => [d.center, d.headcount, d.capacity, d.real, d.productivity.toFixed(2) + '%']);
        generateGenericCSV(["Centro Costo", "Operarios", "Capacidad", "Real (Tango)", "Productividad"], rows, `Reporte_Contable_${startDate}`);
    } else if (activeTab === 'simulator') {
        const rows = simulationData.map(d => [d.sector, d.pointsRequired, d.peopleRounded, d.availableResources, d.isBottleneck ? 'FALTA MAQUINA' : 'OK']);
        generateGenericCSV(["Sector", "Carga Puntos", "Personas Necesarias", "Recursos Disponibles", "Estado"], rows, `Simulacion_${simModel}_${simQty}`);
    }
  };

  const handleSmartPDF = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(30, 41, 59); doc.text(`Informe Técnico`, 14, 20);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`TopSafe S.A. | ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Período: ${startDate} al ${endDate}`, 14, 34);

    if (activeTab === 'audit') {
        doc.text("AUDITORÍA STOCK", 14, 45);
        autoTable(doc, { 
            startY: 50, 
            head: [['Modelo', 'Valor Std', 'Tango', 'Teórico', 'Declarado', 'Desvío', 'Estado']], 
            body: auditData.map(d => [d.model, d.standardValue.toFixed(1), d.tangoQty, d.theoreticalPoints.toFixed(0), d.declaredPoints.toFixed(0), d.difference.toFixed(0), Math.abs(d.deviationPct)<5?"OK":(d.difference > 0 ? "Exceso" : "Faltante")]) 
        });
    } else if (activeTab === 'efficiency') {
        doc.text("EFICIENCIA Y OCIO", 14, 45);
        const data = getEfficiencyData();
        if (efficiencyView === 'sector') {
            autoTable(doc, { startY: 50, head: [['Sector', 'Real', 'Potencial', 'Diferencia', 'Rendimiento', 'Estado']], body: data.map((s:any) => [s.name, s.points.toFixed(0), s.potentialPoints.toFixed(0), s.difference.toFixed(0), s.performancePct.toFixed(1) + '%', s.isSurplus ? 'Positivo' : 'Negativo']) });
        } else {
            autoTable(doc, { startY: 50, head: [['Operario', 'Días', 'Real', 'Potencial', 'Diferencia', 'Rendimiento']], body: data.map((s:any) => [s.name, s.daysWorked, s.points.toFixed(0), s.potentialPoints.toFixed(0), s.difference.toFixed(0), s.performancePct.toFixed(1) + '%']) });
        }
    } else if (activeTab === 'accounting') {
        doc.text("REPORTE DE PRODUCTIVIDAD (CONTABLE)", 14, 45);
        autoTable(doc, {
            startY: 55,
            head: [['Centro de Costo', 'Cant. Op', 'Capacidad (Pts)', 'Prod. Real (Pts)', 'Productividad']],
            body: accountingData.map(r => [r.center, r.headcount, r.capacity.toLocaleString('es-AR'), r.real.toLocaleString('es-AR'), r.productivity.toFixed(1) + '%']),
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] } 
        });
    } else if (activeTab === 'simulator') {
        doc.text(`SIMULACIÓN DE DOTACIÓN: Modelo ${simModel} (${simQty} u.)`, 14, 45);
        doc.text(`Capacidad Base: ${dailyTarget.toLocaleString()} pts/persona`, 14, 52);
        autoTable(doc, {
            startY: 60,
            head: [['Centro de Costo', 'Carga (Pts)', 'Personas Necesarias', 'Recursos Disp.', 'Estado']],
            body: simulationData.map(r => [
                r.sector, 
                r.pointsRequired.toLocaleString(), 
                `${r.peopleRounded} (${r.peopleNeeded.toFixed(2)})`,
                r.availableResources,
                r.isBottleneck ? 'FALTA MAQ.' : 'OK'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [249, 115, 22] },
            bodyStyles: { textColor: [0, 0, 0] },
            columnStyles: { 4: { fontStyle: 'bold' } }
        });
    } else {
        doc.text("Resumen de Métricas Generales", 14, 45);
        autoTable(doc, { 
            startY: 50, 
            head: [['Fecha', 'Operario', 'Modelo', 'Cant', 'Pts', 'Obs']], 
            body: filteredLogs.slice(0, 100).map(l => [new Date(l.timestamp).toLocaleDateString(), l.operatorName, l.model, l.quantity, l.totalPoints.toFixed(1), l.comments||'-']),
            columnStyles: { 5: { cellWidth: 50 } }
        });
    }
    doc.save(`Reporte_${activeTab}_${startDate}.pdf`); setIsGeneratingPDF(false);
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
             <button onClick={() => setActiveTab('simulator')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'simulator' ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Zap className="w-3 h-3 inline mr-1"/> Simulador</button>
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
                <button onClick={refreshData} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200" title="Refrescar Datos (Forzar descarga)"><RefreshCw className="w-5 h-5" /></button>
                <div className="h-8 w-px bg-slate-300 mx-1"></div>
                <button onClick={handleEngineeringAccess} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isAuthorized ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {isAuthorized ? <BrainCircuit className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>

      {/* --- PESTAÑAS (Métricas, Eficiencia, Auditoría, Contabilidad, Simulador) --- */}
      {/* ... [El contenido de las pestañas sigue igual, se omite para no repetir todo el bloque gigante] ... */}
      {/* Puedes dejar el contenido de las pestañas tal cual estaba en tu versión anterior, solo el Header cambió para quitar el botón peligroso. */}
      {/* A CONTINUACIÓN, EL MODAL MODIFICADO CON EL BOTÓN SEGURO: */}

      {/* MODAL DE CONTRASEÑA (Igual) */}
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

      {/* MODAL DE INGENIERÍA (AQUÍ ESTÁ EL CAMBIO IMPORTANTE) */}
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
                  {/* SECCIÓN IA (Igual) */}
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
                  {/* SECCIÓN MANTENIMIENTO DE BASE DE DATOS (NUEVA) */}
                  <div className="bg-purple-50 p-6 rounded-xl shadow-sm border border-purple-200">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2"><Database className="w-5 h-5"/> Mantenimiento DB</h4>
                    <p className="text-xs text-purple-700 mb-4">Herramientas críticas. Usar con precaución.</p>
                    
                    <button 
                      onClick={() => {
                        if(confirm("⚠ ¿CONFIRMAS LA CORRECCIÓN DE DATOS?\n\nEl sistema buscará registros donde la operación sea una medida (ej: '2m', '10m') y moverá ese texto al nombre del Modelo.\n\nEsta acción modificará la base de datos de forma permanente.")) {
                          fixDatabaseData().then(() => refreshData());
                        }
                      }} 
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 shadow-md transition-all mb-2"
                    >
                      <PenTool className="w-4 h-4"/> CORREGIR MODELOS (2m, 10m...)
                    </button>
                  </div>

                  {/* SECCIÓN EXPORTACIÓN (Igual) */}
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
