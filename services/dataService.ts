import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, 
  query, orderBy, setDoc, where, writeBatch, limit 
} from 'firebase/firestore';
import { ProductionLog, Sector, PointRule, NewsItem } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Re-exportamos NewsItem
export type { NewsItem };

// =========================================================
// 1. CONFIGURACIÓN DE FIREBASE (INTEGRADA)
// =========================================================

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDYAX9gis2MKtEabUzZDPFUlhmeX38U_Bs",
  authDomain: "produccion-topsafe.firebaseapp.com",
  projectId: "produccion-topsafe",
  storageBucket: "produccion-topsafe.firebasestorage.app",
  messagingSenderId: "798185919710",
  appId: "1:798185919710:web:bf420d718d7bc2b3e9de4f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// =========================================================
// 2. CONSTANTES
// =========================================================

const LOGS_COL = 'production_logs';
const CONFIG_COL = 'app_config';
const NEWS_COL = 'news';
const MATRIX_COL = 'points_matrix';
const DEFAULT_TARGET = 24960;

// =========================================================
// 3. GESTIÓN DE LOGS (OPTIMIZADO POR FECHAS)
// =========================================================

// MODIFICACIÓN CLAVE: Acepta argumentos de fecha opcionales
export const getLogs = async (startDate?: string, endDate?: string): Promise<ProductionLog[]> => {
  try {
    const logsRef = collection(db, LOGS_COL);
    let q;

    if (startDate && endDate) {
      // ESCENARIO A: Rango de fechas (Filtrado en Servidor = Ahorro Real)
      // Ajustamos las horas para cubrir todo el día seleccionado
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      q = query(
        logsRef,
        where('timestamp', '>=', start.toISOString()),
        where('timestamp', '<=', end.toISOString()),
        orderBy('timestamp', 'desc')
      );
    } else {
      // ESCENARIO B: Carga inicial (Sin fechas)
      // Bajamos de 800 a 100. Esto es lo que carga al abrir la app.
      // 100 lecturas es mucho mas seguro que 800 para desarrollo.
      q = query(
        logsRef, 
        orderBy('timestamp', 'desc'), 
        limit(100) 
      );
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
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
        orderNumber: data.orderNumber || '',
        comments: data.comments || '' 
      } as ProductionLog;
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return [];
  }
};

// Mantenemos el alias para compatibilidad
export const getProductionLogs = () => getLogs(); 

export const saveLog = async (log: any) => {
  const { id, ...logData } = log;
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
  const updateData: any = { ...data };
  if (data.operatorName) updateData.operator = data.operatorName;
  if (data.totalPoints) updateData.points = data.totalPoints;
  await updateDoc(docRef, updateData);
};

export const deleteProductionLog = async (id: string) => {
  await deleteDoc(doc(db, LOGS_COL, id));
};

export const clearLogs = async (): Promise<void> => {
  // OJO: Esto lee para borrar. Si tienes 5000 registros, son 5000 lecturas + 5000 escrituras.
  // Úsalo con precaución.
  const q = query(collection(db, LOGS_COL));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
};

// =========================================================
// 4. CONFIGURACIÓN (LISTAS Y METAS)
// =========================================================

const fetchList = async (docId: string): Promise<string[]> => {
  try {
    const d = await getDocs(collection(db, CONFIG_COL));
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

export const deleteOperatorWithData = async (operatorName: string) => {
  try {
    const currentOps = await getOperators();
    const newOps = currentOps.filter(op => op !== operatorName);
    await saveOperators(newOps);

    // Nota: Esto también consume lecturas, pero es una acción administrativa rara.
    const q = query(collection(db, LOGS_COL), where('operatorName', '==', operatorName));
    const snapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    return true;
  } catch (error) {
    console.error("Error eliminando operario:", error);
    return false;
  }
};

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

// =========================================================
// 5. MATRIZ DE PUNTOS
// =========================================================

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

export const getPointRuleSync = (matrix: PointRule[], sector: Sector | string, model: string, operation: string) => {
  return matrix.find(r => r.sector === sector && r.model === model && r.operation === operation);
};

export const calculatePointsSync = (matrix: PointRule[], sector: Sector, model: string, operation: string, quantity: number) => {
  const rule = getPointRuleSync(matrix, sector, model, operation);
  return rule ? rule.pointsPerUnit * quantity : 0;
};

// =========================================================
// 6. NOTICIAS Y COMUNICADOS
// =========================================================

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

// =========================================================
// 7. EXPORTACIONES (CSV / PDF)
// =========================================================

export const downloadCSV = (logs: ProductionLog[], filename: string) => {
  if (logs.length === 0) { alert("No hay datos."); return; }
  
  const delimiter = ";"; 
  const headers = ["ID", "Fecha", "Orden", "Operario", "Sector", "Modelo", "Operacion", "Cantidad", "Total Puntos", "Comentarios"];
  
  const rows = logs.map(log => [
    log.id,
    new Date(log.timestamp).toLocaleDateString(),
    log.orderNumber || '-',
    `"${log.operatorName}"`, 
    log.sector,
    log.model,
    log.operation,
    log.quantity,
    log.totalPoints.toFixed(2).replace('.', ','),
    `"${log.comments || ''}"` 
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

  const tableColumn = ["Fecha", "Orden", "Operario", "Modelo", "Op", "Cant", "Pts", "Obs."];
  const tableRows = logs.map(log => [
    new Date(log.timestamp).toLocaleDateString(),
    log.orderNumber || '-',
    log.operatorName,
    log.model,
    log.operation,
    log.quantity,
    log.totalPoints.toFixed(1),
    log.comments ? log.comments.substring(0, 15) + '...' : '-' 
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    theme: 'grid',
    headStyles: { fillColor: [217, 119, 6] }, 
    styles: { fontSize: 8 }, 
  });
  doc.save(`${filename}.pdf`);
};

// =========================================================
// 8. SISTEMA DE RESTAURACIÓN (BACKUP)
// =========================================================

export const restoreSystemFromBackup = async (backupData: any) => {
  try {
    const batch = writeBatch(db);
    
    // 1. Restaurar Configuración (Listas)
    if (backupData.config) {
      if (backupData.config.operators) await saveOperators(backupData.config.operators);
      if (backupData.config.models) await saveModels(backupData.config.models);
      if (backupData.config.operations) await saveOperations(backupData.config.operations);
    }

    // 2. Restaurar Matriz de Puntos
    if (backupData.matrix && Array.isArray(backupData.matrix)) {
      for (const rule of backupData.matrix) {
        const ref = rule.id ? doc(db, 'points_matrix', rule.id) : doc(collection(db, 'points_matrix'));
        const { id, ...data } = rule; 
        await setDoc(ref, data, { merge: true });
      }
    }

    // 3. Restaurar Noticias
    if (backupData.news && Array.isArray(backupData.news)) {
      for (const item of backupData.news) {
        const ref = doc(db, 'news', item.id);
        const { id, ...data } = item;
        await setDoc(ref, data, { merge: true });
      }
    }

    // 4. Restaurar LOGS (Producción)
    if (backupData.logs && Array.isArray(backupData.logs)) {
      const chunkSize = 50;
      for (let i = 0; i < backupData.logs.length; i += chunkSize) {
        const chunk = backupData.logs.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (log: any) => {
          const ref = log.id ? doc(db, 'production_logs', log.id) : doc(collection(db, 'production_logs'));
          const { id, ...data } = log;
          const cleanData = {
            ...data,
            operator: data.operatorName || data.operator,
            points: data.totalPoints || data.points
          };
          await setDoc(ref, cleanData, { merge: true });
        }));
      }
    }

    return true;
  } catch (error) {
    console.error("Error crítico en restauración:", error);
    return false;
  }
};
