import { db } from '../src/firebaseConfig';
// AGREGADO 'where' a los imports
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, setDoc, where } from 'firebase/firestore';
import { POINTS_MATRIX as DEFAULT_MATRIX, OPERATORS as DEFAULT_OPS, MODELS as DEFAULT_MODELS, OPERATIONS as DEFAULT_OPERATIONS } from '../constants';
import { ProductionLog, Sector, PointRule } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// En services/dataService.ts

// ... tus otros imports ...
import { deleteDoc, doc } from 'firebase/firestore'; // Asegúrate de que esto esté importado arriba

// Collections
const LOGS_COL = 'production_logs';
const CONFIG_COL = 'app_config';

// --- CONFIGURATION GETTERS (Async) ---

// Helper to get config document or default
const fetchConfigList = async (docId: string, defaultData: string[]): Promise<string[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, CONFIG_COL));
    const docData = querySnapshot.docs.find(d => d.id === docId);
    if (docData && docData.exists()) {
      return docData.data().list as string[];
    }
    return defaultData;
  } catch (error) {
    console.error(`Error fetching ${docId}:`, error);
    return defaultData;
  }
};

export const getOperators = async (): Promise<string[]> => fetchConfigList('operators', DEFAULT_OPS);
export const getModels = async (): Promise<string[]> => fetchConfigList('models', DEFAULT_MODELS);
export const getOperations = async (): Promise<string[]> => fetchConfigList('operations', DEFAULT_OPERATIONS);

export const getPointsMatrix = async (): Promise<PointRule[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'points_matrix'));
    if (querySnapshot.empty) return DEFAULT_MATRIX.map(r => ({...r, id: crypto.randomUUID()}));
    
    return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as PointRule));
  } catch (error) {
    console.error("Error fetching matrix:", error);
    return DEFAULT_MATRIX;
  }
};

// --- METAS DE PRODUCTIVIDAD ---

const DEFAULT_TARGET = 24960; 

export const getProductivityTarget = async (): Promise<number> => {
  try {
    const querySnapshot = await getDocs(collection(db, CONFIG_COL));
    const targetDoc = querySnapshot.docs.find(d => d.id === 'productivity_target');
    
    if (targetDoc && targetDoc.exists()) {
      return targetDoc.data().value as number;
    }
    return DEFAULT_TARGET;
  } catch (error) {
    console.error("Error fetching target:", error);
    return DEFAULT_TARGET;
  }
};

export const saveProductivityTarget = async (value: number) => {
  await setDoc(doc(db, CONFIG_COL, 'productivity_target'), { value });
};

// --- CONFIGURATION SETTERS (Async) ---

const saveConfigList = async (docId: string, list: string[]) => {
  try {
    await setDoc(doc(db, CONFIG_COL, docId), { list });
  } catch (error) {
    console.error(`Error saving ${docId}:`, error);
    throw error;
  }
};

export const saveOperators = async (list: string[]) => saveConfigList('operators', list);
export const saveModels = async (list: string[]) => saveConfigList('models', list);
export const saveOperations = async (list: string[]) => saveConfigList('operations', list);

export const savePointsMatrix = async (list: PointRule[]) => {
  console.warn("Bulk save matrix not optimized for Firestore. Use addRule/deleteRule.");
};

export const addPointRule = async (rule: PointRule) => {
  const { id, ...data } = rule;
  await addDoc(collection(db, 'points_matrix'), data);
}

export const deletePointRule = async (id: string) => {
  await deleteDoc(doc(db, 'points_matrix', id));
}

export const updatePointRule = async (rule: PointRule) => {
  const { id, ...data } = rule;
  const docRef = doc(db, 'points_matrix', id);
  await updateDoc(docRef, data);
}

// --- BUSINESS LOGIC (Hybrid) ---

export const calculatePointsSync = (matrix: PointRule[], sector: Sector, model: string, operation: string, quantity: number): number => {
  const rule = matrix.find(
    (r) => r.sector === sector && r.model === model && r.operation === operation
  );
  return rule ? rule.pointsPerUnit * quantity : 0;
};

export const getPointRuleSync = (matrix: PointRule[], sector: Sector, model: string, operation: string): PointRule | undefined => {
  return matrix.find(
    (r) => r.sector === sector && r.model === model && r.operation === operation
  );
};

// --- LOGGING PERSISTENCE (Async) ---

export const saveLog = async (log: ProductionLog): Promise<void> => {
  const { id, ...logData } = log;
  await addDoc(collection(db, LOGS_COL), logData);
};

export const updateProductionLog = async (log: ProductionLog): Promise<void> => {
  const { id, ...logData } = log;
  const docRef = doc(db, LOGS_COL, id); 
  await updateDoc(docRef, logData);
};

export const getLogs = async (): Promise<ProductionLog[]> => {
  try {
    const q = query(collection(db, LOGS_COL), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ProductionLog));
  } catch (error) {
    console.error("Error getting logs:", error);
    return [];
  }
};

export const clearLogs = async (): Promise<void> => {
  const q = query(collection(db, LOGS_COL));
  const snapshot = await getDocs(q);
  const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletePromises);
};

// --- SISTEMA DE NOTICIAS / COMUNICADOS (NUEVO) ---

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  expiresAt: string;
  priority: 'normal' | 'high';
}

export const addNews = async (news: NewsItem) => {
  const { id, ...data } = news;
  await setDoc(doc(db, 'news', id), data);
};

export const deleteNews = async (id: string) => {
  await deleteDoc(doc(db, 'news', id));
};

export const getActiveNews = async (): Promise<NewsItem[]> => {
  try {
    const now = new Date().toISOString();
    // Traer solo noticias donde 'expiresAt' sea mayor (futuro) a 'ahora'
    const q = query(collection(db, 'news'), where('expiresAt', '>', now));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as NewsItem));
  } catch (error) {
    console.error("Error fetching news:", error);
    return [];
  }
};

// --- EXPORT UTILS ---

export const downloadCSV = (logs: ProductionLog[], filename: string) => {
  if (logs.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }
  const delimiter = ";"; 
  const headers = ["ID", "Fecha", "Hora Inicio", "Hora Fin", "Operario", "Sector", "Modelo", "Operacion", "Cantidad", "Total Puntos"];
  const rows = logs.map(log => [
    log.id,
    new Date(log.timestamp).toLocaleDateString(),
    log.startTime,
    log.endTime,
    `"${log.operatorName}"`, 
    log.sector,
    log.model,
    log.operation,
    log.quantity,
    log.totalPoints.toString().replace('.', ',')
  ]);
  const csvContent = "\uFEFF" + [
    headers.join(delimiter),
    ...rows.map(r => r.join(delimiter))
  ].join("\n");

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadPDF = (logs: ProductionLog[], title: string, filename: string) => {
  if (logs.length === 0) {
    alert("No hay datos para generar el PDF.");
    return;
  }
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Reporte de Producción - TopSafe", 14, 15);
  doc.setFontSize(12);
  doc.text(title, 14, 22);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);
  const totalQty = logs.reduce((acc, l) => acc + l.quantity, 0);
  const totalPts = logs.reduce((acc, l) => acc + l.totalPoints, 0);
  doc.text(`Total Unidades: ${totalQty} | Total Puntos: ${totalPts.toFixed(1)}`, 14, 35);
  const tableColumn = ["Fecha", "Operario", "Modelo", "Operación", "Cant.", "Puntos"];
  const tableRows = logs.map(log => [
    new Date(log.timestamp).toLocaleDateString(),
    log.operatorName,
    log.model,
    log.operation,
    log.quantity,
    log.totalPoints.toFixed(1)
  ]);
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 40,
    theme: 'grid',
    headStyles: { fillColor: [217, 119, 6] }, 
    styles: { fontSize: 9 },
  });
  doc.save(`${filename}.pdf`);
};
// ... tus otras funciones ...

// AGREGA ESTA FUNCIÓN:
export const deleteProductionLog = async (id: string) => {
  await deleteDoc(doc(db, 'production_logs', id));
};
