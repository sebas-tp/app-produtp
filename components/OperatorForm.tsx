import React, { useState, useEffect } from 'react';
import { Sector, ProductionLog, PointRule } from '../types';
import { 
  calculatePointsSync, getPointRuleSync, saveLog, getLogs, 
  getOperators, getModels, getOperations, getPointsMatrix, downloadCSV 
} from '../services/dataService';
import { Save, AlertCircle, CheckCircle, Clock, FileDown, History, Loader2 } from 'lucide-react';

export const OperatorForm: React.FC = () => {
  // Dynamic Lists
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [modelList, setModelList] = useState<string[]>([]);
  const [operationList, setOperationList] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  
  // Data State
  const [todayLogs, setTodayLogs] = useState<ProductionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  // Initialization
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const [ops, mods, opers, mtx] = await Promise.all([
          getOperators(),
          getModels(),
          getOperations(),
          getPointsMatrix()
        ]);
        setOperatorList(ops);
        setModelList(mods);
        setOperationList(opers);
        setMatrix(mtx);
        await loadTodayLogs();
      } catch (e) {
        console.error("Error loading init data", e);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  // Filter logs when operator changes or after save
  useEffect(() => {
    if (!isLoading) loadTodayLogs();
  }, [formData.operatorName]);

  const loadTodayLogs = async () => {
    const allLogs = await getLogs();
    const today = new Date().toISOString().split('T')[0];
    
    // Filter by Today AND Operator (if selected)
    const filtered = allLogs.filter(log => {
      const logDate = log.timestamp.split('T')[0];
      const matchesOperator = formData.operatorName ? log.operatorName === formData.operatorName : true;
      return logDate === today && matchesOperator;
    });
    setTodayLogs(filtered);
  };

  // Auto-calculate points
  useEffect(() => {
    const qty = parseInt(formData.quantity) || 0;
    // Use Sync version because matrix is already loaded
    const rule = getPointRuleSync(matrix, formData.sector, formData.model, formData.operation);
    
    if (rule) {
      setUnitValue(rule.pointsPerUnit);
      setPredictedPoints(rule.pointsPerUnit * qty);
    } else {
      setUnitValue(0);
      setPredictedPoints(0);
    }
  }, [formData.sector, formData.model, formData.operation, formData.quantity, matrix]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.operatorName || !formData.model || !formData.operation || !formData.quantity) {
      alert("Por favor complete todos los campos requeridos");
      return;
    }

    if (unitValue === 0) {
      const confirm = window.confirm("¡Atención! Esta combinación no tiene valor en la matriz de puntos. ¿Guardar de todos modos con 0 puntos?");
      if (!confirm) return;
    }

    setIsSaving(true);
    try {
      await saveLog({
        id: crypto.randomUUID(), // Temp ID, Firebase will assign one too but useful for key
        timestamp: new Date().toISOString(),
        ...formData,
        quantity: parseInt(formData.quantity),
        totalPoints: predictedPoints
      });

      setStatus('success');
      await loadTodayLogs(); // Refresh the list from cloud
      
      // Reset volatile fields
      setFormData(prev => ({ ...prev, quantity: '', model: '', operation: '' }));
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
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
    const filename = `Produccion_${formData.operatorName || 'General'}_${new Date().toISOString().split('T')[0]}`;
    downloadCSV(todayLogs, filename);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-10 h-10 animate-spin text-amber-500"/></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* FORMULARIO DE CARGA */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border-t-4 border-amber-500">
        <div className="bg-slate-800 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-amber-500">
              <Clock className="w-6 h-6" /> Registro Diario
            </h2>
            <p className="text-slate-300 text-sm">Carga de producción individual</p>
          </div>
          <div className="bg-amber-500 text-slate-900 text-xs font-bold px-2 py-1 rounded">
            OPERARIO
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Operario */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Operario Responsable</label>
            <select 
              name="operatorName" 
              value={formData.operatorName} 
              onChange={handleChange}
              className="w-full rounded-lg border-slate-300 border p-3 focus:ring-2 focus:ring-amber-500 outline-none text-slate-900 font-medium bg-slate-50"
              required
            >
              <option value="">Seleccione su nombre...</option>
              {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>

          {/* Grid de Horarios */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Hora Inicio</label>
              <input 
                type="time" 
                name="startTime" 
                value={formData.startTime}
                onChange={handleChange}
                className="w-full rounded-lg border-slate-300 border p-3 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Hora Fin</label>
              <input 
                type="time" 
                name="endTime" 
                value={formData.endTime}
                onChange={handleChange}
                className="w-full rounded-lg border-slate-300 border p-3 bg-white text-slate-900"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 my-4"></div>

          {/* Sector y Detalles */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Sector</label>
            <select 
              name="sector" 
              value={formData.sector} 
              onChange={handleChange}
              className="w-full rounded-lg border-amber-200 border-2 p-3 bg-amber-50 font-bold text-slate-900"
            >
              {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Modelo / Producto</label>
              <select 
                name="model" 
                value={formData.model} 
                onChange={handleChange}
                className="w-full rounded-lg border-slate-300 border p-3 text-slate-900 bg-white"
                required
              >
                <option value="">Seleccionar...</option>
                {modelList.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Operación Realizada</label>
              <select 
                name="operation" 
                value={formData.operation} 
                onChange={handleChange}
                className="w-full rounded-lg border-slate-300 border p-3 text-slate-900 bg-white"
                required
              >
                <option value="">Seleccionar...</option>
                {operationList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
          </div>

          {/* Cantidad y Feedback Visual */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">CANTIDAD (Unidades)</label>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                name="quantity" 
                value={formData.quantity} 
                onChange={handleChange}
                placeholder="0"
                className="w-1/2 rounded-lg border-slate-300 border-2 focus:border-amber-500 p-4 text-3xl font-black text-center text-slate-900 outline-none"
                min="1"
                required
              />
              <div className="w-1/2 bg-slate-900 rounded-lg p-3 text-center border border-slate-700 shadow-inner">
                <span className="block text-xs text-amber-500 font-bold uppercase tracking-wider">Total Puntos</span>
                <span className="block text-3xl font-black text-white">{predictedPoints.toFixed(1)}</span>
                <span className="text-xs text-slate-400">{unitValue > 0 ? `${unitValue} pts/u` : 'Sin Valor Asignado'}</span>
              </div>
            </div>
          </div>

          {/* Botón Acción */}
          <button 
            type="submit"
            disabled={isSaving}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-lg py-4 rounded-xl shadow-lg transform active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
            {isSaving ? 'GUARDANDO...' : 'CONFIRMAR PRODUCCIÓN'}
          </button>

          {/* Mensajes de Estado */}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-green-800 bg-green-100 p-4 rounded-lg animate-pulse border border-green-200">
              <CheckCircle className="w-6 h-6" />
              <span className="font-bold">¡Guardado Correctamente!</span>
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

      {/* HISTORIAL DIARIO */}
      {formData.operatorName && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                Mi Producción de Hoy
              </h3>
              <p className="text-xs text-slate-500">Operario: <span className="font-bold">{formData.operatorName}</span></p>
            </div>
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
              disabled={todayLogs.length === 0}
            >
              <FileDown className="w-4 h-4" />
              Excel
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-100">
                <tr>
                  <th className="px-4 py-2">Modelo</th>
                  <th className="px-4 py-2">Operación</th>
                  <th className="px-4 py-2 text-right">Cant.</th>
                  <th className="px-4 py-2 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {todayLogs.map(log => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">{log.model}</td>
                    <td className="px-4 py-2 text-slate-600">{log.operation}</td>
                    <td className="px-4 py-2 text-right font-bold">{log.quantity}</td>
                    <td className="px-4 py-2 text-right text-amber-600 font-bold">{log.totalPoints}</td>
                  </tr>
                ))}
                {todayLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                      No hay registros hoy para este operario.
                    </td>
                  </tr>
                )}
              </tbody>
              {todayLogs.length > 0 && (
                <tfoot className="bg-slate-50 font-bold text-slate-800">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-right">TOTAL HOY:</td>
                    <td className="px-4 py-2 text-right">{todayLogs.reduce((a,b) => a + b.quantity, 0)}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{todayLogs.reduce((a,b) => a + b.totalPoints, 0).toFixed(1)}</td>
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