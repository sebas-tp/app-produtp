import React, { useState, useEffect } from 'react';
import { Sector, ProductionLog, PointRule } from '../types';
import { 
  calculatePointsSync, getPointRuleSync, saveLog, getLogs, 
  getOperators, getModels, getOperations, getPointsMatrix, downloadCSV,
  updateProductionLog, getProductivityTarget 
} from '../services/dataService';
import { Save, AlertCircle, CheckCircle, Clock, FileDown, History, Loader2, Pencil, X, RefreshCw, Trophy, Target, Calendar } from 'lucide-react';

export const OperatorForm: React.FC = () => {
  // Dynamic Lists
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [modelList, setModelList] = useState<string[]>([]);
  const [operationList, setOperationList] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [dailyTarget, setDailyTarget] = useState<number>(24960);
   
  // Data State
  const [currentViewLogs, setCurrentViewLogs] = useState<ProductionLog[]>([]); // Renombrado para que tenga sentido con el filtro
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- NUEVO ESTADO: FECHA SELECCIONADA ---
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [formData, setFormData] = useState({
    operatorName: '',
    sector: Sector.CORTE,
    model: '',
    operation: '',
    quantity: '',
    startTime: '08:00',
    endTime: '17:00'
  });

  const [predictedPoints, setPredictedPoints] = useState<number>(0);
  const [unitValue, setUnitValue] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // KPI Calculation (Se basa en la fecha que estás mirando)
  const totalPointsView = currentViewLogs.reduce((acc, log) => acc + log.totalPoints, 0);
  const progressPercent = dailyTarget > 0 ? (totalPointsView / dailyTarget) * 100 : 0;
  const isGoalReached = progressPercent >= 100;

  // Initialization
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const [ops, mods, opers, mtx, target] = await Promise.all([
          getOperators(),
          getModels(),
          getOperations(),
          getPointsMatrix(),
          getProductivityTarget()
        ]);
        setOperatorList(ops);
        setModelList(mods);
        setOperationList(opers);
        setMatrix(mtx);
        setDailyTarget(target);
        await loadLogsByDate();
      } catch (e) {
        console.error("Error loading init data", e);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  // Recargar si cambia el Operario O la Fecha seleccionada
  useEffect(() => {
    if (!isLoading) loadLogsByDate();
  }, [formData.operatorName, selectedDate]);

  const loadLogsByDate = async () => {
    const allLogs = await getLogs();
    
    const filtered = allLogs.filter(log => {
      const logDate = log.timestamp.split('T')[0];
      const matchesOperator = formData.operatorName ? log.operatorName === formData.operatorName : true;
      // Filtramos por la fecha seleccionada en el calendario
      return logDate === selectedDate && matchesOperator;
    });
    setCurrentViewLogs(filtered);
  };

  // Auto-calculate points
  useEffect(() => {
    const qty = parseInt(formData.quantity) || 0;
    const rule = getPointRuleSync(matrix, formData.sector, formData.model, formData.operation);
    
    if (rule) {
      setUnitValue(rule.pointsPerUnit);
      setPredictedPoints(rule.pointsPerUnit * qty);
    } else {
      setUnitValue(0);
      setPredictedPoints(0);
    }
  }, [formData.sector, formData.model, formData.operation, formData.quantity, matrix]);

  const handleEditClick = (log: ProductionLog) => {
    setEditingId(log.id);
    setFormData({
      operatorName: log.operatorName,
      sector: log.sector,
      model: log.model,
      operation: log.operation,
      quantity: log.quantity.toString(),
      startTime: log.startTime,
      endTime: log.endTime
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData(prev => ({ ...prev, quantity: '', model: '', operation: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.operatorName || !formData.model || !formData.operation || !formData.quantity) {
      alert("Por favor complete todos los campos requeridos");
      return;
    }

    if (unitValue === 0) {
      if (!window.confirm("Esta combinación vale 0 puntos. ¿Guardar igual?")) return;
    }

    setIsSaving(true);
    try {
      // Usamos la fecha actual REAL para el timestamp de creación, aunque estemos mirando el historial
      // Opcional: Si quieres permitir "Cargar cosas con fecha de ayer", tendríamos que cambiar esto.
      // Por seguridad, dejamos que siempre se guarde con fecha/hora actual del sistema.
      const logData = {
        timestamp: new Date().toISOString(),
        ...formData,
        quantity: parseInt(formData.quantity),
        totalPoints: predictedPoints
      };

      if (editingId) {
        await updateProductionLog({ id: editingId, ...logData });
      } else {
        await saveLog({ id: crypto.randomUUID(), ...logData });
      }

      setStatus('success');
      // Si el usuario estaba viendo "Ayer" y guarda algo "Hoy", 
      // cambiamos la vista a "Hoy" para que vea lo que acaba de hacer.
      const today = new Date().toISOString().split('T')[0];
      if (selectedDate !== today) setSelectedDate(today);
      else await loadLogsByDate();
      
      setEditingId(null);
      setFormData(prev => ({ ...prev, quantity: '', model: '', operation: '' }));
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDownload = () => {
    const filename = `Produccion_${formData.operatorName || 'General'}_${selectedDate}`;
    downloadCSV(currentViewLogs, filename);
  };

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-10 h-10 animate-spin text-amber-500"/></div>;

  const themeColor = editingId ? 'blue' : 'amber';
  const headerBg = editingId ? 'bg-blue-600' : 'bg-slate-800';
  const borderColor = editingId ? 'border-blue-500' : 'border-amber-500';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* FORMULARIO DE CARGA */}
      <div className={`bg-white rounded-xl shadow-lg overflow-hidden border-t-4 ${borderColor} transition-colors duration-300`}>
        <div className={`${headerBg} p-6 text-white flex justify-between items-center transition-colors duration-300`}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {editingId ? <RefreshCw className="w-6 h-6 animate-spin-slow" /> : <Clock className="w-6 h-6" />} 
              {editingId ? 'EDITANDO REGISTRO' : 'Registro Diario'}
            </h2>
            <p className="text-slate-200 text-sm">
              {editingId ? 'Modifique los valores y guarde los cambios' : 'Carga de producción individual'}
            </p>
          </div>
          <div className={`text-slate-900 text-xs font-bold px-2 py-1 rounded ${editingId ? 'bg-blue-200' : 'bg-amber-500'}`}>
            {editingId ? 'MODO EDICIÓN' : 'OPERARIO'}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Operario Responsable</label>
            <select 
              name="operatorName" 
              value={formData.operatorName} 
              onChange={handleChange}
              disabled={!!editingId}
              className={`w-full rounded-lg border-slate-300 border p-3 focus:ring-2 focus:ring-${themeColor}-500 outline-none text-slate-900 font-medium bg-slate-50 disabled:opacity-60`}
              required
            >
              <option value="">Seleccione su nombre...</option>
              {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Hora Inicio</label>
              <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full rounded-lg border-slate-300 border p-3 bg-white text-slate-900"/>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Hora Fin</label>
              <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full rounded-lg border-slate-300 border p-3 bg-white text-slate-900"/>
            </div>
          </div>
          <div className="border-t border-slate-100 my-4"></div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Sector</label>
            <select name="sector" value={formData.sector} onChange={handleChange} className="w-full rounded-lg border-amber-200 border-2 p-3 bg-amber-50 font-bold text-slate-900">
              {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Modelo / Producto</label>
              <select name="model" value={formData.model} onChange={handleChange} className="w-full rounded-lg border-slate-300 border p-3 text-slate-900 bg-white" required>
                <option value="">Seleccionar...</option>
                {modelList.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Operación Realizada</label>
              <select name="operation" value={formData.operation} onChange={handleChange} className="w-full rounded-lg border-slate-300 border p-3 text-slate-900 bg-white" required>
                <option value="">Seleccionar...</option>
                {operationList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">CANTIDAD (Unidades)</label>
            <div className="flex items-center gap-4">
              <input 
                type="number" name="quantity" value={formData.quantity} onChange={handleChange} placeholder="0"
                className={`w-1/2 rounded-lg border-slate-300 border-2 focus:border-${themeColor}-500 p-4 text-3xl font-black text-center text-slate-900 outline-none transition-colors`}
                min="1" required
              />
              <div className="w-1/2 bg-slate-900 rounded-lg p-3 text-center border border-slate-700 shadow-inner">
                <span className={`block text-xs font-bold uppercase tracking-wider ${editingId ? 'text-blue-400' : 'text-amber-500'}`}>Total Puntos</span>
                <span className="block text-3xl font-black text-white">{predictedPoints.toFixed(1)}</span>
                <span className="text-xs text-slate-400">{unitValue > 0 ? `${unitValue} pts/u` : 'Sin Valor Asignado'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {editingId && (
              <button type="button" onClick={handleCancelEdit} className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2">
                <X className="w-5 h-5" /> Cancelar
              </button>
            )}
            <button type="submit" disabled={isSaving} className={`flex-1 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'} text-white font-black text-lg py-4 rounded-xl shadow-lg transform active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50`}>
              {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : (editingId ? <RefreshCw className="w-6 h-6" /> : <Save className="w-6 h-6" />)}
              {isSaving ? 'GUARDANDO...' : (editingId ? 'ACTUALIZAR REGISTRO' : 'CONFIRMAR PRODUCCIÓN')}
            </button>
          </div>
          {status === 'success' && (
            <div className="flex items-center gap-2 text-green-800 bg-green-100 p-4 rounded-lg animate-pulse border border-green-200">
              <CheckCircle className="w-6 h-6" />
              <span className="font-bold">{editingId ? '¡Actualizado correctamente!' : '¡Guardado correctamente!'}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-800 bg-red-100 p-4 rounded-lg border border-red-200">
              <AlertCircle className="w-6 h-6" />
              <span className="font-bold">Error al guardar. Verifique conexión.</span>
            </div>
          )}
        </form>
      </div>

      {/* TARJETA DE OBJETIVO (KPI) - Se actualiza según la fecha seleccionada */}
      {formData.operatorName && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
          <div className="flex justify-between items-end mb-2">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-600" />
                Meta Diaria: {dailyTarget.toLocaleString()} pts
              </h3>
              <p className="text-sm text-slate-500">
                Progreso de {formData.operatorName} - <span className="font-bold text-slate-700">
                  {selectedDate === new Date().toISOString().split('T')[0] ? "Hoy" : selectedDate}
                </span>
              </p>
            </div>
            <div className={`text-2xl font-black ${isGoalReached ? 'text-green-600' : 'text-slate-700'}`}>
              {progressPercent.toFixed(1)}%
            </div>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${isGoalReached ? 'bg-green-500' : 'bg-amber-500'}`} 
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            ></div>
          </div>
          {isGoalReached && (
            <div className="mt-2 flex items-center gap-2 text-green-700 font-bold text-sm animate-bounce">
              <Trophy className="w-4 h-4" /> ¡Objetivo Cumplido!
            </div>
          )}
        </div>
      )}

      {/* HISTORIAL / LISTADO */}
      {formData.operatorName && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                Historial de Producción
              </h3>
            </div>
            
            {/* NUEVO: FILTRO DE FECHA */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-sm text-slate-700 font-medium outline-none"
                    />
                </div>

                <button onClick={handleDownload} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm" disabled={currentViewLogs.length === 0}>
                <FileDown className="w-4 h-4" /> Excel
                </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-100">
                <tr>
                  <th className="px-4 py-2">Modelo</th>
                  <th className="px-4 py-2">Operación</th>
                  {/* NUEVAS COLUMNAS DE HORA */}
                  <th className="px-4 py-2 text-center">Inicio</th>
                  <th className="px-4 py-2 text-center">Fin</th>
                  <th className="px-4 py-2 text-right">Cant.</th>
                  <th className="px-4 py-2 text-right">Puntos</th>
                  <th className="px-4 py-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {currentViewLogs.map(log => (
                  <tr key={log.id} className={`border-b border-slate-50 hover:bg-slate-50 ${editingId === log.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-slate-700">{log.model}</td>
                    <td className="px-4 py-2 text-slate-600">{log.operation}</td>
                    {/* CELDAS DE HORA */}
                    <td className="px-4 py-2 text-center text-slate-500 text-xs">{log.startTime}</td>
                    <td className="px-4 py-2 text-center text-slate-500 text-xs">{log.endTime}</td>
                    <td className="px-4 py-2 text-right font-bold">{log.quantity}</td>
                    <td className="px-4 py-2 text-right text-amber-600 font-bold">{log.totalPoints.toFixed(1)}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleEditClick(log)} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Editar registro">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {currentViewLogs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">No hay registros para la fecha seleccionada.</td></tr>}
              </tbody>
              {currentViewLogs.length > 0 && (
                <tfoot className="bg-slate-50 font-bold text-slate-800">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right">TOTAL DEL DÍA:</td>
                    <td className="px-4 py-2 text-right">{currentViewLogs.reduce((a,b) => a + b.quantity, 0)}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{totalPointsView.toFixed(1)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
