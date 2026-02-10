import React, { useState, useEffect, useRef } from 'react';
import { Sector, ProductionLog, PointRule } from '../types';
import { 
  getPointRuleSync, saveLog, getLogs, 
  getOperators, getModels, getOperations, getPointsMatrix, downloadCSV,
  updateProductionLog, deleteProductionLog, 
  getProductivityTarget, getActiveNews, NewsItem,
  getLogsByDate,
  verifyOperatorPin
} from '../services/dataService';
import { 
  Save, AlertCircle, CheckCircle, Clock, FileDown, History, Loader2, 
  Pencil, X, RefreshCw, Trophy, Target, Calendar, Megaphone, Hash, Trash2, 
  MessageSquare, TrendingUp, Search, ChevronDown, Filter, Lock, LogOut, UserCheck, ShieldCheck 
} from 'lucide-react';

// --- UTILIDAD PARA MOSTRAR FECHAS CORRECTAMENTE ---
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  // Cortamos el string para evitar conversiones de zona horaria al visualizar
  const parts = dateString.split('T')[0].split('-'); 
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

// --- PROPS ---
interface OperatorFormProps {
  isManager?: boolean; 
}

// --- COMPONENTE PRINCIPAL ---
export const OperatorForm: React.FC<OperatorFormProps> = ({ isManager = false }) => {
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
  
  // --- SEGURIDAD ---
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

  // LÓGICA DE PROMEDIOS
  const stats = React.useMemo(() => {
    if (operatorHistory.length === 0) return { avgGeneral: 0, avgProductive: 0 };
    const totalAll = operatorHistory.reduce((a, b) => a + b.points, 0);
    const avgGeneral = totalAll / operatorHistory.length;
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
        
        // SOLO RECUPERAMOS SESIÓN SI NO ES GERENTE
        if (!isManager) {
            const savedSession = localStorage.getItem('topsafe_operator_session');
            if (savedSession && ops.includes(savedSession)) {
                setLockedOperator(savedSession);
                setFormData(prev => ({ ...prev, operatorName: savedSession }));
            }
        }
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    initData();
  }, [isManager]);

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
      
      uniqueLogs.filter(l => l.operatorName === formData.operatorName).forEach(log => {
        const date = log.timestamp.split('T')[0];
        if (!groupedData[date]) groupedData[date] = { points: 0, hasUnrated: false };
        groupedData[date].points += log.totalPoints;
        if (log.totalPoints === 0 && log.quantity > 0) groupedData[date].hasUnrated = true;
      });

      setOperatorHistory(Object.entries(groupedData).map(([date, d]) => ({ date, ...d })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30));
    }
  };

  useEffect(() => {
    const rule = getPointRuleSync(matrix, formData.sector, formData.model, formData.operation);
    const val = rule ? rule.pointsPerUnit : 0;
    setUnitValue(val);
    setPredictedPoints(val * (parseInt(formData.quantity) || 0));
  }, [formData.sector, formData.model, formData.operation, formData.quantity, matrix]);

  // --- MANEJO DE SELECCIÓN Y PIN ---
  const handleOperatorSelect = (name: string) => {
    if (isManager) {
        setFormData(prev => ({ ...prev, operatorName: name }));
        return; 
    }
    setPendingOperator(name);
    setPinInput('');
    setPinError(false);
    setShowPinModal(true);
  };

  const handlePinConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = await verifyOperatorPin(pendingOperator, pinInput);
    if (isValid) {
        setLockedOperator(pendingOperator);
        setFormData(prev => ({ ...prev, operatorName: pendingOperator }));
        localStorage.setItem('topsafe_operator_session', pendingOperator); 
        setShowPinModal(false);
    } else {
        setPinError(true);
        setPinInput('');
    }
  };

  const handleLogout = () => {
    if(window.confirm("¿Seguro que deseas cerrar sesión?")) {
        setLockedOperator(null);
        setFormData(prev => ({ ...prev, operatorName: '' }));
        localStorage.removeItem('topsafe_operator_session');
        setOperatorHistory([]);
        setCurrentViewLogs([]);
    }
  };

  const handleEditClick = (log: ProductionLog) => {
    setEditingId(log.id!);
    const logDate = log.timestamp.split('T')[0];
    setSelectedDate(logDate);
    setFormData({ 
      operatorName: log.operatorName, 
      sector: log.sector as Sector, 
      model: log.model, 
      operation: log.operation, 
      quantity: log.quantity.toString(), 
      startTime: log.startTime || '08:00', 
      endTime: log.endTime || '17:00',
      orderNumber: log.orderNumber || '', 
      comments: log.comments || ''        
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = async (id: string) => {
    if (!id) return;
    if (window.confirm("¿Estás seguro de que quieres BORRAR este registro?")) {
      try {
        await deleteProductionLog(id);
        if (editingId === id) handleCancelEdit();
        await loadLogsByDate();
      } catch (error: any) { alert(`No se pudo borrar: ${error.message || error}`); }
    }
  };

  const handleCancelEdit = () => { 
    setEditingId(null); 
    setFormData(prev => ({ ...prev, quantity: '', model: '', operation: '', comments: '' })); 
  };

  // --- SUBMIT CORREGIDO ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Validaciones básicas
    if (!formData.operatorName || !formData.model || !formData.operation || !formData.quantity) { 
        alert("Complete todos los campos obligatorios"); 
        return; 
    }
    
    // 2. CORRECCIÓN DEL CARTEL DE 0 PUNTOS (Ahora se ejecuta ANTES de la seguridad)
    // Usamos 'unitValue' que viene del useEffect
    if (unitValue === 0) {
        if (!window.confirm("⚠️ ATENCIÓN: Esta combinación vale 0 puntos.\n\n¿Desea guardarla de todas formas?")) {
            return; // Cancelamos si el usuario dice que no
        }
    }

    // 3. Validación de Seguridad (PIN)
    if (!isManager && !lockedOperator) {
        alert("Debes identificarte con tu PIN antes de guardar.");
        handleOperatorSelect(formData.operatorName); // Abre modal
        return;
    }

    setIsSaving(true);
    try {
      // 4. CORRECCIÓN DE FECHA (Evita el día anterior)
      // Construimos la fecha usando los componentes locales explícitamente
      const [year, month, day] = selectedDate.split('-').map(Number);
      const entryDate = new Date(year, month - 1, day); // Mes empieza en 0 en JS
      
      // Agregamos la hora actual para mantener el orden cronológico
      const now = new Date();
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      
      const logData = { 
        timestamp: entryDate.toISOString(), 
        ...formData, 
        quantity: parseInt(formData.quantity), 
        totalPoints: predictedPoints 
      };
      
      if (editingId) await updateProductionLog({ id: editingId, ...logData });
      else await saveLog({ id: crypto.randomUUID(), ...logData });

      setStatus('success'); 
      await loadLogsByDate(); 
      setEditingId(null); 
      setFormData(prev => ({...prev, quantity: '', model: '', operation: '', comments: ''}));
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) { 
        console.error(err);
        setStatus('error'); 
    } finally { 
        setIsSaving(false); 
    }
  };

  const handleChange = (e: any) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleDownload = () => downloadCSV(currentViewLogs, `Prod_${formData.operatorName}_${selectedDate}`);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-orange-500"/></div>;

  const themeColor = editingId ? 'blue' : 'amber';
  const headerBg = editingId ? 'bg-blue-600' : 'bg-slate-800';
  const borderColor = editingId ? 'border-blue-500' : 'border-amber-500';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* --- MODAL PIN --- */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200">
                <div className="flex justify-center mb-4"><div className="bg-blue-50 p-4 rounded-full"><Lock className="w-8 h-8 text-blue-600"/></div></div>
                <h3 className="text-xl font-black text-center text-slate-800 mb-1 uppercase">Hola, {pendingOperator}</h3>
                <p className="text-sm text-slate-500 text-center mb-6 font-medium">Ingresa tu PIN de seguridad para acceder.</p>
                <form onSubmit={handlePinConfirm}>
                    <input 
                        type="password" 
                        inputMode="numeric" 
                        maxLength={4} 
                        className="w-full text-center text-4xl font-black tracking-[0.5em] p-4 border-2 border-slate-200 rounded-xl mb-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-slate-800" 
                        placeholder="••••" 
                        autoFocus
                        value={pinInput}
                        onChange={e => { setPinInput(e.target.value); setPinError(false); }}
                    />
                    {pinError && <div className="bg-red-50 text-red-600 text-xs font-bold p-2 rounded-lg text-center mb-4 animate-pulse">PIN INCORRECTO</div>}
                    <div className="flex gap-3">
                        <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-600 transition-colors uppercase text-xs tracking-wider">Cancelar</button>
                        <button type="submit" disabled={pinInput.length < 4} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-white transition-colors uppercase text-xs tracking-wider disabled:opacity-50">Entrar</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* NOTICIAS */}
      {!isManager && news.length > 0 && (
        <div className="space-y-3">
           {news.map(item => (
             <div key={item.id} className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg shadow-sm flex gap-4 animate-in slide-in-from-top duration-500">
                <div className="bg-blue-100 p-2 rounded-full h-fit"><Megaphone className="w-5 h-5 text-blue-600" /></div>
                <div>
                   <h4 className="font-bold text-blue-900">{item.title}</h4>
                   <p className="text-blue-700 text-sm mt-1">{item.content}</p>
                </div>
             </div>
           ))}
        </div>
      )}

      {/* HEADER Y FORMULARIO */}
      <div className={`bg-white rounded-xl shadow-lg overflow-hidden border-t-4 ${borderColor} transition-colors duration-300`}>
        <div className={`${headerBg} p-6 text-white flex justify-between items-center transition-colors duration-300`}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {editingId ? <RefreshCw className="w-6 h-6 animate-spin-slow" /> : <Clock className="w-6 h-6" />} 
              {editingId ? 'EDITANDO' : (isManager ? 'CARGA GERENCIAL' : 'Producción')}
            </h2>
            {isManager && <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded shadow-sm tracking-wide">MODO ADMIN</span>}
          </div>
          
          <div className="flex flex-col items-end">
             <label className="text-[10px] uppercase font-bold text-slate-300 mb-1">Fecha de Trabajo</label>
             <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm p-1 rounded-lg border border-white/20 hover:bg-white/20 transition-colors cursor-pointer">
               <Calendar className="w-4 h-4 text-white" />
               <input 
                 type="date" 
                 value={selectedDate} 
                 onChange={(e) => setSelectedDate(e.target.value)} 
                 className="bg-transparent text-white font-bold text-sm outline-none color-white-calendar cursor-pointer"
               />
             </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* SELECTOR DE OPERARIO (CON LOGIN) */}
            {lockedOperator && !isManager ? (
                <div className="w-full rounded-lg border-2 border-green-500 bg-green-50 p-3 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full border border-green-200"><UserCheck className="w-5 h-5 text-green-700"/></div>
                        <div>
                            <div className="text-[10px] uppercase font-black text-green-600 tracking-wider">Operario Verificado</div>
                            <div className="font-black text-slate-800 text-lg uppercase">{lockedOperator}</div>
                        </div>
                    </div>
                    <button type="button" onClick={handleLogout} className="bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 p-2 rounded-lg border border-slate-200 transition-colors" title="Cerrar Sesión">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            ) : (
                <div className="relative">
                   {isManager && <div className="absolute -top-3 left-2 z-10 bg-orange-100 text-orange-700 text-[9px] font-bold px-2 rounded border border-orange-200 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Acceso Total</div>}
                   <SearchableSelect 
                      label="Operario Responsable" 
                      options={operatorList} 
                      value={formData.operatorName} 
                      onChange={handleOperatorSelect} 
                      placeholder={isManager ? "Seleccionar operario..." : "Buscar tu nombre..."} 
                      disabled={!!editingId} 
                   />
                </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 uppercase flex items-center gap-1">
                <Hash className="w-4 h-4 text-slate-400"/> N° Orden / Lote
              </label>
              <input type="text" name="orderNumber" value={formData.orderNumber} onChange={handleChange} placeholder="Ej: 10245" className="w-full rounded-lg border-slate-300 border p-3 focus:ring-2 focus:ring-amber-500 outline-none text-slate-900 font-medium placeholder-slate-300" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-bold text-slate-700 mb-1">Hora Inicio</label><input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full rounded-lg border-slate-300 border p-3 bg-white text-slate-900"/></div>
            <div><label className="block text-sm font-bold text-slate-700 mb-1">Hora Fin</label><input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full rounded-lg border-slate-300 border p-3 bg-white text-slate-900"/></div>
          </div>
          
          <div className="border-t border-slate-100 my-4"></div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Sector</label>
            <select name="sector" value={formData.sector} onChange={handleChange} className="w-full rounded-lg border-amber-200 border-2 p-3 bg-amber-50 font-bold text-slate-900 outline-none">
              {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableSelect 
              label="Modelo / Producto" 
              options={modelList} 
              value={formData.model} 
              onChange={(val) => setFormData(prev => ({ ...prev, model: val }))}
              placeholder="Buscar modelo..."
            />
            <SearchableSelect 
              label="Operación Realizada" 
              options={operationList} 
              value={formData.operation} 
              onChange={(val) => setFormData(prev => ({ ...prev, operation: val }))}
              placeholder="Buscar operación..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">CANTIDAD (Unidades)</label>
            <div className="flex items-center gap-4">
              <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} placeholder="0" className={`w-1/2 rounded-lg border-slate-300 border-2 focus:border-${themeColor}-500 p-4 text-3xl font-black text-center text-slate-900 outline-none transition-colors`} min="1" required/>
              <div className="w-1/2 bg-slate-900 rounded-lg p-3 text-center border border-slate-700 shadow-inner">
                <span className={`block text-xs font-bold uppercase tracking-wider ${editingId ? 'text-blue-400' : 'text-amber-500'}`}>Total Puntos</span>
                <span className="block text-3xl font-black text-white">{predictedPoints.toFixed(1)}</span>
                <span className="text-xs text-slate-400">{unitValue > 0 ? `${unitValue} pts/u` : 'Sin Valor Asignado'}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
              <MessageSquare className="w-4 h-4 text-slate-400"/> Observaciones (Opcional)
            </label>
            <input 
              type="text" 
              name="comments" 
              value={formData.comments} 
              onChange={handleChange} 
              placeholder="Ej: Se cortó la luz, Máquina lenta, etc." 
              className="w-full rounded-lg border-slate-300 border p-3 focus:ring-2 focus:ring-slate-400 outline-none text-slate-700 text-sm"
            />
          </div>
          
          <div className="flex gap-3 pt-2">
            {editingId && <button type="button" onClick={handleCancelEdit} className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2"><X className="w-5 h-5" /> Cancelar</button>}
            <button type="submit" disabled={isSaving} className={`flex-1 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'} text-white font-black text-lg py-4 rounded-xl shadow-lg transform active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50`}>
              {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : (editingId ? <RefreshCw className="w-6 h-6" /> : <Save className="w-6 h-6" />)}
              {isSaving ? 'GUARDANDO...' : (editingId ? 'ACTUALIZAR REGISTRO' : 'CONFIRMAR PRODUCCIÓN')}
            </button>
          </div>
          
          {status === 'success' && <div className="flex items-center gap-2 text-green-800 bg-green-100 p-4 rounded-lg animate-pulse border border-green-200"><CheckCircle className="w-6 h-6" /><span className="font-bold">{editingId ? '¡Actualizado correctamente!' : '¡Guardado correctamente!'}</span></div>}
          {status === 'error' && <div className="flex items-center gap-2 text-red-800 bg-red-100 p-4 rounded-lg border border-red-200"><AlertCircle className="w-6 h-6" /><span className="font-bold">Error al guardar. Verifique conexión.</span></div>}
        </form>
      </div>

      {/* --- GRID DE ESTADISTICAS --- */}
      {formData.operatorName && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* TARJETA 1: PROGRESO */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200 h-full flex flex-col justify-center">
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Target className="w-5 h-5 text-amber-600" />Meta Diaria: {dailyTarget.toLocaleString()} pts</h3>
                <p className="text-sm text-slate-500">
                  Progreso de {formData.operatorName} - <span className="font-bold text-slate-700">{formatDate(selectedDate)}</span>
                </p>
              </div>
              <div className={`text-2xl font-black ${isGoalReached ? 'text-green-600' : 'text-slate-700'}`}>{progressPercent.toFixed(1)}%</div>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden"><div className={`h-full transition-all duration-1000 ${isGoalReached ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(progressPercent, 100)}%` }}></div></div>
            {isGoalReached && <div className="mt-2 flex items-center gap-2 text-green-700 font-bold text-sm animate-bounce"><Trophy className="w-4 h-4" /> ¡Objetivo Cumplido!</div>}
          </div>

          {/* TARJETA 2: HISTORIAL */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200 h-full">
             <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600"/>
                <h3 className="font-bold text-slate-800">Mi Rendimiento Reciente (15 Días)</h3>
             </div>
             
             <div className="grid grid-cols-2 gap-2 p-3 bg-blue-50/50 border-b border-slate-100">
               <div className="bg-white p-2 rounded border border-slate-200 text-center shadow-sm opacity-70">
                 <div className="text-[10px] uppercase font-bold text-slate-400">Promedio Bruto</div>
                 <div className="text-lg font-bold text-slate-500">{stats.avgGeneral.toFixed(0)}%</div>
                 <div className="text-[9px] text-slate-400">Incluye todo</div>
               </div>
               <div className="bg-white p-2 rounded border border-blue-300 text-center shadow-md ring-1 ring-blue-100">
                 <div className="text-[10px] uppercase font-bold text-blue-600 flex justify-center items-center gap-1"><Filter className="w-3 h-3"/> Prom. Puro</div>
                 <div className="text-xl font-black text-blue-700">{stats.avgProductive.toFixed(0)}%</div>
                 <div className="text-[9px] text-blue-500 font-medium">Excluye días mixtos/sin pts</div>
               </div>
             </div>

             <div className="max-h-48 overflow-y-auto custom-scrollbar">
               <table className="w-full text-sm">
                 <thead className="bg-white text-xs text-slate-500 uppercase border-b border-slate-100 sticky top-0">
                   <tr>
                     <th className="px-6 py-2 text-left bg-slate-50">Fecha</th>
                     <th className="px-6 py-2 text-right bg-slate-50">Puntos</th>
                     <th className="px-6 py-2 text-right bg-slate-50">Efic. %</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {operatorHistory.map((day, idx) => {
                     const dayPercent = (day.points / dailyTarget) * 100;
                     const isIgnored = day.points === 0 || day.hasUnrated;
                     
                     return (
                       <tr key={idx} className={`hover:bg-slate-50 ${isIgnored ? 'bg-slate-50/50 text-slate-400' : ''}`}>
                         <td className="px-6 py-2 font-medium">
                           {formatDate(day.date)}
                           {day.hasUnrated && <span className="ml-2 text-[9px] bg-slate-200 text-slate-500 px-1 rounded" title="Día con tareas sin precio (excluido)">MIXTO</span>}
                         </td>
                         <td className="px-6 py-2 text-right">{day.points.toLocaleString()}</td>
                         <td className="px-6 py-2 text-right">
                           <span className={`px-2 py-1 rounded text-xs font-bold ${
                             isIgnored ? 'bg-slate-100 text-slate-400' : 
                             (dayPercent >= 100 ? 'bg-green-100 text-green-700' : (dayPercent >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'))
                           }`}>
                             {dayPercent.toFixed(0)}%
                           </span>
                         </td>
                       </tr>
                     );
                   })}
                   {operatorHistory.length === 0 && <tr><td colSpan={3} className="px-6 py-4 text-center text-slate-400 italic">Sin registros previos.</td></tr>}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* HISTORIAL DETALLADO DEL DÍA */}
      {formData.operatorName && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50">
            <div><h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-amber-600" /> Detalle de Tareas ({formatDate(selectedDate)})</h3></div>
            <div className="flex items-center gap-2">
                <button onClick={handleDownload} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm" disabled={currentViewLogs.length === 0}><FileDown className="w-4 h-4" /> Excel</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-100">
                <tr>
                  <th className="px-4 py-2">Orden</th>
                  <th className="px-4 py-2">Modelo</th>
                  <th className="px-4 py-2">Operación</th>
                  <th className="px-4 py-2 text-right">Cant.</th>
                  <th className="px-4 py-2 text-right">Puntos</th>
                  <th className="px-4 py-2">Obs.</th>
                  <th className="px-4 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {currentViewLogs.map(log => (
                  <tr key={log.id} className={`border-b border-slate-50 hover:bg-slate-50 ${editingId === log.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-2 text-slate-500 font-mono text-xs font-bold">{log.orderNumber || '-'}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{log.model}</td>
                    <td className="px-4 py-2 text-slate-600">{log.operation}</td>
                    <td className="px-4 py-2 text-right font-bold">{log.quantity}</td>
                    <td className="px-4 py-2 text-right text-amber-600 font-bold">{log.totalPoints.toFixed(1)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500 max-w-[120px] truncate" title={log.comments}>{log.comments || '-'}</td>
                    <td className="px-4 py-2 text-center flex items-center justify-center gap-1">
                      <button onClick={() => handleEditClick(log)} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Editar"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteClick(log.id!)} className="text-slate-400 hover:text-red-600 transition-colors p-1" title="Borrar"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {currentViewLogs.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">No hay registros para la fecha seleccionada.</td></tr>}
              </tbody>
              {currentViewLogs.length > 0 && <tfoot className="bg-slate-50 font-bold text-slate-800"><tr><td colSpan={4} className="px-4 py-2 text-right">TOTAL DEL DÍA:</td><td className="px-4 py-2 text-right">{currentViewLogs.reduce((a,b) => a + b.quantity, 0)}</td><td className="px-4 py-2 text-right text-amber-600">{totalPointsView.toFixed(1)}</td><td colSpan={2}></td></tr></tfoot>}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
