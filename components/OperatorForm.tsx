import React, { useState, useEffect, useRef } from 'react';
import { Sector, ProductionLog, PointRule } from '../types';
import { 
  getPointRuleSync, saveLog, getLogs, 
  getOperators, getModels, getOperations, getPointsMatrix, downloadCSV,
  updateProductionLog, deleteProductionLog, 
  getProductivityTarget, getActiveNews, NewsItem,
  getLogsByDate,
  verifyOperatorPin // <--- IMPORTANTE: La función de seguridad
} from '../services/dataService';
import { 
  Save, AlertCircle, CheckCircle, Clock, FileDown, History, Loader2, 
  Pencil, X, RefreshCw, Trophy, Target, Calendar, Megaphone, Hash, Trash2, 
  MessageSquare, TrendingUp, Search, ChevronDown, Filter, Lock, LogOut, UserCheck 
} from 'lucide-react';

// --- UTILIDAD PARA FECHAS (SOLUCIÓN DEFINITIVA A ZONA HORARIA) ---
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  // Cortamos el string "YYYY-MM-DD" manualmente para evitar que el navegador reste horas
  const parts = dateString.split('-'); 
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`; 
  }
  return dateString;
};

// --- COMPONENTE SELECTOR ---
interface SearchableSelectProps {
  label: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ label, options, value, onChange, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">{label}</label>
      <div onClick={() => !disabled && setIsOpen(!isOpen)} className={`w-full rounded-lg border border-slate-300 p-3 flex justify-between items-center bg-white cursor-pointer ${disabled ? 'opacity-60 bg-slate-100' : ''}`}>
        <span className={`font-medium ${value ? 'text-slate-900' : 'text-slate-400'}`}>{value || placeholder || 'Seleccionar...'}</span>
        <ChevronDown className="w-4 h-4 text-slate-400"/>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95">
          <div className="p-2 sticky top-0 bg-white"><input type="text" autoFocus placeholder="Buscar..." className="w-full p-2 border rounded" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div>
          {filteredOptions.map((opt, idx) => (
            <div key={idx} onClick={() => { onChange(opt); setIsOpen(false); setSearchTerm(''); }} className="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm">{opt}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---
export const OperatorForm: React.FC = () => {
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [modelList, setModelList] = useState<string[]>([]);
  const [operationList, setOperationList] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [dailyTarget, setDailyTarget] = useState<number>(24960);
  const [news, setNews] = useState<NewsItem[]>([]);

  const [currentViewLogs, setCurrentViewLogs] = useState<ProductionLog[]>([]); 
  const [operatorHistory, setOperatorHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // --- ESTADOS DE SEGURIDAD (PIN) ---
  const [lockedOperator, setLockedOperator] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingOperator, setPendingOperator] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formData, setFormData] = useState({
    operatorName: '', sector: Sector.CORTE, model: '', operation: '', quantity: '', startTime: '08:00', endTime: '17:00', orderNumber: '', comments: '' 
  });
  const [predictedPoints, setPredictedPoints] = useState(0);
  const [unitValue, setUnitValue] = useState(0);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const totalPointsView = currentViewLogs.reduce((acc, log) => acc + log.totalPoints, 0);
  const progressPercent = dailyTarget > 0 ? (totalPointsView / dailyTarget) * 100 : 0;
  const isGoalReached = progressPercent >= 100;

  // LÓGICA DE PROMEDIOS (REAL vs PURO)
  const stats = React.useMemo(() => {
    if (operatorHistory.length === 0) return { avgGeneral: 0, avgProductive: 0 };
    
    // Promedio General (Bruto)
    const totalAll = operatorHistory.reduce((a, b) => a + b.points, 0);
    const avgGeneral = totalAll / operatorHistory.length;
    
    // Promedio Puro (Filtra días mixtos/sin puntos)
    const pureDays = operatorHistory.filter(d => d.points > 0 && !d.hasUnrated);
    const totalPure = pureDays.reduce((a, b) => a + b.points, 0);
    const avgProductive = pureDays.length > 0 ? totalPure / pureDays.length : 0;

    return { 
      avgGeneral: (avgGeneral / dailyTarget) * 100, 
      avgProductive: (avgProductive / dailyTarget) * 100 
    };
  }, [operatorHistory, dailyTarget]);

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const [ops, mods, opers, mtx, target, activeNews] = await Promise.all([
          getOperators(), getModels(), getOperations(), getPointsMatrix(), getProductivityTarget(), getActiveNews()
        ]);
        setOperatorList(ops); setModelList(mods); setOperationList(opers); setMatrix(mtx); setDailyTarget(target); setNews(activeNews);
        
        // RECUPERAR SESIÓN GUARDADA
        const savedOp = localStorage.getItem('topsafe_session_user');
        if (savedOp && ops.includes(savedOp)) {
          setLockedOperator(savedOp);
          setFormData(prev => ({ ...prev, operatorName: savedOp }));
        }
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    initData();
  }, []);

  useEffect(() => { if (!isLoading) loadLogsByDate(); }, [formData.operatorName, selectedDate]);

  const loadLogsByDate = async () => {
    const logsFromDB = await getLogsByDate(selectedDate);
    const filteredView = logsFromDB.filter(log => formData.operatorName ? log.operatorName === formData.operatorName : true);
    setCurrentViewLogs(filteredView);

    if (formData.operatorName) {
      const cachedLogs = await getLogs(); 
      const combinedLogs = [...cachedLogs, ...logsFromDB];
      const uniqueLogs = Array.from(new Map(combinedLogs.map(item => [item.id, item])).values());
      const groupedData: Record<string, { points: number, hasUnrated: boolean }> = {};
      
      const opLogs = uniqueLogs.filter(l => l.operatorName === formData.operatorName);
      
      opLogs.forEach(log => {
        const date = log.timestamp.split('T')[0];
        if (!groupedData[date]) groupedData[date] = { points: 0, hasUnrated: false };
        groupedData[date].points += log.totalPoints;
        if (log.totalPoints === 0 && log.quantity > 0) groupedData[date].hasUnrated = true;
      });

      const historyArray = Object.entries(groupedData)
        .map(([date, d]) => ({ date, ...d }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30); // 30 días

      setOperatorHistory(historyArray);
    }
  };

  useEffect(() => {
    const rule = getPointRuleSync(matrix, formData.sector, formData.model, formData.operation);
    const val = rule ? rule.pointsPerUnit : 0;
    setUnitValue(val);
    setPredictedPoints(val * (parseInt(formData.quantity) || 0));
  }, [formData.sector, formData.model, formData.operation, formData.quantity, matrix]);

  // --- MANEJO DE PIN Y SESIÓN ---
  const handleOperatorSelect = (name: string) => {
    setPendingOperator(name);
    setPinInput('');
    setPinError(false);
    setShowPinModal(true);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validamos el PIN contra la base de datos
    const isValid = await verifyOperatorPin(pendingOperator, pinInput);
    
    if (isValid) {
      setLockedOperator(pendingOperator);
      setFormData(prev => ({ ...prev, operatorName: pendingOperator }));
      localStorage.setItem('topsafe_session_user', pendingOperator); // Guardamos sesión
      setShowPinModal(false);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    if (window.confirm("¿Cerrar sesión?")) {
      setLockedOperator(null);
      setFormData(prev => ({ ...prev, operatorName: '' }));
      localStorage.removeItem('topsafe_session_user');
      setOperatorHistory([]);
      setCurrentViewLogs([]);
    }
  };

  // --- HANDLERS COMUNES ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.operatorName || !formData.model || !formData.operation || !formData.quantity) { alert("Completar campos"); return; }
    
    setIsSaving(true);
    try {
      // Crear fecha combinando el día seleccionado y la hora actual
      const entryDate = new Date(selectedDate);
      const now = new Date();
      entryDate.setHours(now.getHours(), now.getMinutes());
      // Ajuste local para evitar UTC
      const localISO = new Date(entryDate.getTime() - (entryDate.getTimezoneOffset() * 60000)).toISOString();

      const logData = { timestamp: localISO, ...formData, quantity: parseInt(formData.quantity), totalPoints: predictedPoints };
      
      if (editingId) await updateProductionLog({ id: editingId, ...logData });
      else await saveLog({ id: crypto.randomUUID(), ...logData });

      setStatus('success'); await loadLogsByDate(); setEditingId(null); setFormData(prev => ({...prev, quantity: '', model: '', operation: '', comments: ''}));
      setTimeout(() => setStatus('idle'), 3000);
    } catch { setStatus('error'); } finally { setIsSaving(false); }
  };

  const handleEditClick = (log: ProductionLog) => { setEditingId(log.id!); setSelectedDate(log.timestamp.split('T')[0]); setFormData({...log, sector: log.sector as Sector, quantity: log.quantity.toString()}); window.scrollTo(0,0); };
  const handleDeleteClick = async (id: string) => { if(confirm("¿Borrar?")) { await deleteProductionLog(id); await loadLogsByDate(); }};
  const handleCancelEdit = () => { setEditingId(null); setFormData(prev => ({...prev, quantity: '', model: '', operation: '', comments: ''})); };
  const handleChange = (e: any) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleDownload = () => downloadCSV(currentViewLogs, `Prod_${formData.operatorName}_${selectedDate}`);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-orange-500"/></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* --- MODAL DE PIN --- */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-center mb-4"><div className="bg-blue-100 p-3 rounded-full"><Lock className="w-8 h-8 text-blue-600"/></div></div>
            <h3 className="text-xl font-bold text-center text-slate-800 mb-1">Hola, {pendingOperator}</h3>
            <p className="text-sm text-slate-500 text-center mb-6">Ingresa tu PIN de 4 dígitos para continuar.</p>
            
            <form onSubmit={handlePinSubmit}>
              <input 
                type="password" 
                inputMode="numeric" 
                pattern="[0-9]*" 
                maxLength={4} 
                className="w-full text-center text-3xl font-bold tracking-[0.5em] p-3 border-2 border-slate-300 rounded-lg mb-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-slate-800" 
                autoFocus 
                value={pinInput} 
                onChange={e => { setPinInput(e.target.value); setPinError(false); }} 
                placeholder="••••"
              />
              {pinError && <p className="text-red-500 text-xs text-center mb-4 font-bold bg-red-50 p-2 rounded animate-pulse">❌ PIN Incorrecto. Intenta de nuevo.</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-600 transition-colors">Cancelar</button>
                <button type="submit" disabled={pinInput.length < 4} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-white transition-colors disabled:opacity-50">Entrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NOTICIAS */}
      {news.length > 0 && (
        <div className="space-y-3">
           {news.map(item => (
             <div key={item.id} className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg shadow-sm flex gap-4">
                <div className="bg-blue-100 p-2 rounded-full h-fit"><Megaphone className="w-5 h-5 text-blue-600" /></div>
                <div><h4 className="font-bold text-blue-900">{item.title}</h4><p className="text-blue-700 text-sm mt-1">{item.content}</p></div>
             </div>
           ))}
        </div>
      )}

      {/* HEADER Y FORMULARIO */}
      <div className={`bg-white rounded-xl shadow-lg overflow-hidden border-t-4 ${editingId ? 'border-blue-500' : 'border-amber-500'} transition-all`}>
        <div className={`${editingId ? 'bg-blue-600' : 'bg-slate-800'} p-6 text-white flex justify-between items-center transition-colors`}>
           <div><h2 className="text-xl font-bold flex gap-2 items-center">{editingId ? <RefreshCw className="w-5 h-5 animate-spin-slow"/> : <Clock className="w-5 h-5"/>} {editingId ? 'EDITANDO' : 'Producción'}</h2></div>
           <div className="flex items-center gap-2 bg-white/10 p-2 rounded-lg cursor-pointer hover:bg-white/20 transition-colors"><Calendar className="w-4 h-4"/><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer"/></div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* SELECTOR CON IDENTIDAD */}
            {lockedOperator ? (
              <div className="w-full border-2 border-green-500 bg-green-50 p-3 rounded-lg flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-full border border-green-200"><UserCheck className="w-5 h-5 text-green-700"/></div>
                  <div><div className="text-[10px] uppercase font-bold text-green-600 tracking-wider">Operario Verificado</div><div className="font-bold text-slate-800 text-lg">{lockedOperator}</div></div>
                </div>
                <button type="button" onClick={handleLogout} className="text-slate-400 hover:text-red-500 bg-white hover:bg-red-50 p-2 rounded-lg border border-slate-200 transition-all" title="Cerrar sesión"><LogOut className="w-5 h-5"/></button>
              </div>
            ) : (
              <SearchableSelect label="Operario" options={operatorList} value={formData.operatorName} onChange={handleOperatorSelect} placeholder="Buscar tu nombre..." disabled={!!editingId} />
            )}
            
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Orden / Lote</label><input type="text" name="orderNumber" value={formData.orderNumber} onChange={handleChange} className="w-full p-3 border rounded-lg font-bold outline-none focus:ring-2 focus:ring-amber-500" placeholder="Ej: 10500"/></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div><label className="text-xs font-bold text-slate-500">Inicio</label><input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full p-3 border rounded-lg bg-white"/></div>
             <div><label className="text-xs font-bold text-slate-500">Fin</label><input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full p-3 border rounded-lg bg-white"/></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <SearchableSelect label="Modelo" options={modelList} value={formData.model} onChange={v => setFormData(p => ({...p, model: v}))}/>
             <SearchableSelect label="Operación" options={operationList} value={formData.operation} onChange={v => setFormData(p => ({...p, operation: v}))}/>
          </div>
          
          <div className="flex items-center gap-4">
             <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} placeholder="Cant." className="w-1/2 p-4 text-3xl font-black text-center border-2 rounded-lg outline-none focus:border-amber-500 transition-colors" required min="1"/>
             <div className="w-1/2 bg-slate-900 text-white p-3 rounded-lg text-center shadow-inner"><div className="text-xs font-bold text-amber-500 uppercase">Total Puntos</div><div className="text-3xl font-black">{predictedPoints.toFixed(1)}</div></div>
          </div>
          
          <input type="text" name="comments" value={formData.comments} onChange={handleChange} placeholder="Observaciones..." className="w-full p-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-300"/>

          <div className="flex gap-3 pt-2">
             {editingId && <button type="button" onClick={handleCancelEdit} className="w-1/3 bg-slate-200 font-bold rounded-lg text-slate-600 hover:bg-slate-300 transition-colors">Cancelar</button>}
             <button type="submit" disabled={isSaving} className={`flex-1 py-4 font-black text-white rounded-xl shadow-lg transform active:scale-95 transition-all ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'}`}>{isSaving ? <Loader2 className="w-6 h-6 animate-spin mx-auto"/> : (editingId ? 'ACTUALIZAR' : 'CONFIRMAR PRODUCCIÓN')}</button>
          </div>
          
          {status === 'success' && <div className="bg-green-100 text-green-800 p-3 rounded-lg font-bold text-center animate-pulse border border-green-200 flex justify-center items-center gap-2"><CheckCircle className="w-5 h-5"/> ¡Guardado Correctamente!</div>}
          {status === 'error' && <div className="bg-red-100 text-red-800 p-3 rounded-lg font-bold text-center border border-red-200 flex justify-center items-center gap-2"><AlertCircle className="w-5 h-5"/> Error al guardar. Intente nuevamente.</div>}
        </form>
      </div>

      {/* DASHBOARD DEL OPERARIO */}
      {formData.operatorName && (
        <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
             <div className="flex justify-between items-end mb-2">
                <div><div className="text-lg font-bold text-slate-800 flex items-center gap-2"><Target className="w-5 h-5 text-amber-600"/> Meta Diaria</div><div className="text-sm text-slate-500 pl-7">{formatDate(selectedDate)}</div></div>
                <div className={`text-2xl font-black ${isGoalReached ? 'text-green-600' : 'text-slate-700'}`}>{progressPercent.toFixed(1)}%</div>
             </div>
             <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden"><div className={`h-full transition-all duration-1000 ${isGoalReached ? 'bg-green-500' : 'bg-amber-500'}`} style={{width: `${Math.min(progressPercent, 100)}%`}}></div></div>
             {isGoalReached && <div className="mt-2 text-center text-sm font-bold text-green-600 bg-green-50 p-1 rounded animate-bounce">🏆 ¡Objetivo Cumplido!</div>}
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
             <div className="bg-slate-50 px-6 py-3 border-b font-bold text-slate-700 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600"/> Rendimiento (15 Días)</div>
             <div className="grid grid-cols-2 gap-3 p-4 bg-blue-50/30 border-b border-slate-100">
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-center shadow-sm"><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Promedio Bruto</div><div className="text-2xl font-black text-slate-600">{stats.avgGeneral.toFixed(0)}%</div></div>
                <div className="bg-white p-3 rounded-lg border border-blue-200 text-center shadow-sm relative overflow-hidden"><div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-bl"></div><div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex justify-center items-center gap-1"><Filter className="w-3 h-3"/> Puro</div><div className="text-2xl font-black text-blue-600">{stats.avgProductive.toFixed(0)}%</div></div>
             </div>
             <div className="max-h-60 overflow-y-auto custom-scrollbar">
               <table className="w-full text-sm">
                  <tbody className="divide-y">
                     {operatorHistory.map((d, i) => (
                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${d.points === 0 ? 'bg-slate-50/50' : ''}`}>
                           <td className="px-6 py-2 text-slate-600">{formatDate(d.date)}</td>
                           <td className="px-6 py-2 text-right font-bold text-slate-800">{d.points.toLocaleString()}</td>
                           <td className="px-6 py-2 text-right text-xs">
                              {d.hasUnrated ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[9px] font-bold">MIXTO</span> : (d.points > 0 ? <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded">{(d.points/dailyTarget*100).toFixed(0)}%</span> : <span className="text-slate-300">-</span>)}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
             </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
             <div className="bg-slate-50 px-6 py-3 border-b font-bold text-slate-700 flex justify-between items-center">
                <span className="flex items-center gap-2"><History className="w-5 h-5 text-amber-600"/> Detalle del Día</span>
                <button onClick={handleDownload} disabled={!currentViewLogs.length} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"><FileDown className="w-3 h-3"/> Excel</button>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-500 text-xs uppercase"><tr><th className="px-4 py-2">Modelo</th><th className="px-4 py-2">Op</th><th className="px-4 py-2 text-right">Cant</th><th className="px-4 py-2 text-right">Pts</th><th className="px-4 py-2 text-center">Acción</th></tr></thead>
                  <tbody className="divide-y">
                     {currentViewLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50">
                           <td className="px-4 py-2 font-medium text-slate-700">{log.model}</td>
                           <td className="px-4 py-2 text-slate-500">{log.operation}</td>
                           <td className="px-4 py-2 text-right font-bold">{log.quantity}</td>
                           <td className="px-4 py-2 text-right text-amber-600 font-bold">{log.totalPoints.toFixed(0)}</td>
                           <td className="px-4 py-2 text-center flex justify-center gap-2">
                              <button onClick={() => handleEditClick(log)} className="p-1 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4"/></button>
                              <button onClick={() => handleDeleteClick(log.id!)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4"/></button>
                           </td>
                        </tr>
                     ))}
                     {currentViewLogs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400 italic">No hay registros para esta fecha.</td></tr>}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
