// services/dataService.ts

// 1. IMPORTAMOS LA BASE DE DATOS DESDE TU ARCHIVO DE CONFIGURACIÓN
import { db } from '../firebaseConfig'; 

import { 
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, 
  query, orderBy, setDoc, where, writeBatch 
} from 'firebase/firestore';

// 2. IMPORTAMOS LOS TIPOS (incluyendo NewsItem) DESDE TYPES.TS
// (Ya no definimos nada aquí para evitar conflictos)
import { ProductionLog, Sector, PointRule, NewsItem } from '../types';

// Re-exportamos para facilitar el uso en componentes
export type { NewsItem };

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- COLECCIONES ---
const LOGS_COL = 'production_logs';
const CONFIG_COL = 'app_config';
const NEWS_COL = 'news';
const MATRIX_COL = 'points_matrix';

const DEFAULT_TARGET = 24960;

// ==========================================
// 1. GESTIÓN DE LOGS (PRODUCCIÓN)
// ==========================================

export const getLogs = async (): Promise<ProductionLog[]> => {
  try {
    const q = query(collection(db, LOGS_COL), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        // Normalización de datos para evitar errores
        timestamp: data.timestamp || new Date().toISOString(),
        createdAt: data.timestamp || new Date().toISOString(),
        date: data.date || '',
        
        operatorName: data.operatorName || data.operator || 'Desconocido',
        operator: data.operatorName || data.operator || 'Desconocido',
        
        sector: data.sector,
        model: data.model,
        operation: data.operation,
        quantity: Number(data.quantity),
        
        totalPoints: Number(data.totalPoints || data.points || 0),
        points: Number(data.totalPoints || data.points || 0),
        
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        orderNumber: data.orderNumber || '' // Nuevo campo N° Orden
      } as ProductionLog;
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return [];
  }
};

// Alias de compatibilidad
export const getProductionLogs = getLogs;

export const saveLog = async (log: any) => {
  const { id, ...logData } = log;
  // Guardamos campos duplicados para asegurar compatibilidad futura
  const dataToSave = {
    ...logData,
    operator: logData.operatorName,
    points: logData.totalPoints
  };
  await addDoc(collection(db, LOGS_COL), dataToSave);
};

export const saveProductionLog = saveLog;

export const updateProductionLog = async (log: Partial<ProductionLog> & { id: string }) => {
  const { id, ...data } = log;
  const docRef = doc(db, LOGS_COL, id);
  // Actualizamos ambos campos si es necesario
  const updateData: any = { ...data };
  if (data.operatorName) updateData.operator = data.operatorName;
  if (data.totalPoints) updateData.points = data.totalPoints;

  await updateDoc(docRef, updateData);
};

// --- FUNCIÓN DE BORRADO ---
export const deleteProductionLog = async (id: string) => {
  await deleteDoc(doc(db, LOGS_COL, id));
};

export const clearLogs = async (): Promise<void> => {
  const q = query(collection(db, LOGS_COL));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
};

// ==========================================
// 2. CONFIGURACIÓN (LISTAS Y METAS)
// ==========================================

const fetchList = async (docId: string): Promise<string[]> => {
  try {
    const d = await getDocs(collection(db, CONFIG_COL));
    // Estrategia doble: Busca documento 'lists' o documento individual
    if (d.docs.find(d => d.id === 'lists')) {
       const listDoc = d.docs.find(d => d.id === 'lists');
       return listDoc?.data()?.[docId] || []; 
    }
    const docData = d.docs.find(d => d.id === docId);
    if (docData && docData.exists()) return docData.data().list || [];
    return [];
  } catch (e) { return []; }
};

export const getOperators = async () => fetchList('operators');
export const getModels = async () => fetchList('models');
export const getOperations = async () => fetchList('operations');

export const saveOperators = async (list: string[]) => { await setDoc(doc(db, CONFIG_COL, 'operators'), { list }); };
export const saveModels = async (list: string[]) => { await setDoc(doc(db, CONFIG_COL, 'models'), { list }); };
export const saveOperations = async (list: string[]) => { await setDoc(doc(db, CONFIG_COL, 'operations'), { list }); };

export const getProductivityTarget = async (): Promise<number> => {
  try {
    const d = await getDocs(collection(db, CONFIG_COL));
    const targetDoc = d.docs.find(d => d.id === 'targets' || d.id === 'productivity_target');
    if (targetDoc && targetDoc.exists()) {
       return targetDoc.data().value || targetDoc.data().dailyTarget || DEFAULT_TARGET;
    }
    return DEFAULT_TARGET;
  } catch (e) { return DEFAULT_TARGET; }
};

export const saveProductivityTarget = async (value: number) => {
  await setDoc(doc(db, CONFIG_COL, 'targets'), { dailyTarget: value }, { merge: true });
};

// ==========================================
// 3. MATRIZ DE PUNTOS
// ==========================================

export const getPointsMatrix = async (): Promise<PointRule[]> => {
  try {
    const snapshot = await getDocs(collection(db, MATRIX_COL));
    if (snapshot.empty) return [];
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PointRule));
  } catch (error) { return []; }
};

export const addPointRule = async (rule: PointRule) => {
  const { id, ...data } = rule;
  await addDoc(collection(db, MATRIX_COL), data);
};

export const updatePointRule = async (rule: PointRule) => {
  const { id, ...data } = rule;
  await updateDoc(doc(db, MATRIX_COL, id!), data);
};

export const deletePointRule = async (id: string) => {
  await deleteDoc(doc(db, MATRIX_COL, id));
};

// Helpers Síncronos
export const getPointRuleSync = (matrix: PointRule[], sector: Sector | string, model: string, operation: string) => {
  return matrix.find(r => r.sector === sector && r.model === model && r.operation === operation);
};

export const calculatePointsSync = (matrix: PointRule[], sector: Sector, model: string, operation: string, quantity: number) => {
  const rule = getPointRuleSync(matrix, sector, model, operation);
  return rule ? rule.pointsPerUnit * quantity : 0;
};

// ==========================================
// 4. NOTICIAS Y COMUNICADOS
// ==========================================

export const getActiveNews = async (): Promise<NewsItem[]> => {
  try {
    const now = new Date().toISOString();
    const q = query(collection(db, NEWS_COL), where('expiresAt', '>', now));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
  } catch (error) { return []; }
};

export const addNews = async (news: NewsItem) => {
  const { id, ...data } = news;
  await addDoc(collection(db, NEWS_COL), data);
};

export const deleteNews = async (id: string) => {
  await deleteDoc(doc(db, NEWS_COL, id));
};

// ==========================================
// 5. EXPORTACIONES (CSV / PDF)
// ==========================================

export const downloadCSV = (logs: ProductionLog[], filename: string) => {
  if (logs.length === 0) { alert("No hay datos."); return; }
  
  const delimiter = ";"; 
  const headers = ["ID", "Fecha", "Orden", "Operario", "Sector", "Modelo", "Operacion", "Cantidad", "Total Puntos"];
  
  const rows = logs.map(log => [
    log.id,
    new Date(log.timestamp).toLocaleDateString(),
    log.orderNumber || '-',
    `"${log.operatorName}"`, 
    log.sector,
    log.model,
    log.operation,
    log.quantity,
    log.totalPoints.toFixed(2).replace('.', ',')
  ]);

  const csvContent = "\uFEFF" + [headers.join(delimiter), ...rows.map(r => r.join(delimiter))].join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadPDF = (logs: ProductionLog[], title: string, filename: string) => {
  if (logs.length === 0) { alert("No hay datos."); return; }
  
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Reporte de Producción - TopSafe", 14, 15);
  doc.setFontSize(12);
  doc.text(title, 14, 22);
  
  const totalQty = logs.reduce((acc, l) => acc + l.quantity, 0);
  const totalPts = logs.reduce((acc, l) => acc + l.totalPoints, 0);
  doc.setFontSize(10);
  doc.text(`Total Unidades: ${totalQty} | Total Puntos: ${totalPts.toFixed(1)}`, 14, 28);

  const tableColumn = ["Fecha", "Orden", "Operario", "Modelo", "Operación", "Cant.", "Pts"];
  const tableRows = logs.map(log => [
    new Date(log.timestamp).toLocaleDateString(),
    log.orderNumber || '-',
    log.operatorName,
    log.model,
    log.operation,
    log.quantity,
    log.totalPoints.toFixed(1)
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    theme: 'grid',
    headStyles: { fillColor: [217, 119, 6] }, 
    styles: { fontSize: 9 },
  });
  doc.save(`${filename}.pdf`);
};
