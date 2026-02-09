import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, 
  query, orderBy, setDoc, where, writeBatch, limit, getDoc 
} from 'firebase/firestore';
import { ProductionLog, PointRule, NewsItem, Sector } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Re-exportamos NewsItem
export type { NewsItem };

// 1. CONFIGURACIÓN DE FIREBASE
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

// 2. CONSTANTES
const LOGS_COL = 'production_logs';
const CONFIG_COL = 'app_config';
const NEWS_COL = 'news';
const MATRIX_COL = 'points_matrix';
const DEFAULT_TARGET = 24960;

// 3. GESTIÓN DE LOGS (OPTIMIZADO CON LIMIT 10)
export const getLogs = async (startDate?: string, endDate?: string): Promise<ProductionLog[]> => {
  try {
    const logsRef = collection(db, LOGS_COL);
    let q;

    if (startDate && endDate) {
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
      q = query(logsRef, orderBy('timestamp', 'desc'), limit(10));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as any;
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

export const getLogsByDate = async (dateString: string): Promise<ProductionLog[]> => {
  try {
    const logsRef = collection(db, LOGS_COL);
    const start = `${dateString}T00:00:00`;
    const end = `${dateString}T23:59:59.999`;

    const q = query(
      logsRef,
      where('timestamp', '>=', start),
      where('timestamp', '<=', end),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as any;
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
    console.error("Error fetching logs by date:", error);
    return [];
  }
};

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
  const q = query(collection(db, LOGS_COL));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => { batch.delete(doc.ref); });
  await batch.commit();
};

// 4. CONFIGURACIÓN
const fetchList = async (docId: string): Promise<string[]> => {
  try {
    const d = await getDocs(collection(db, CONFIG_COL));
    if (d.docs.find(d => d.id === 'lists')) {
       const listDoc = d.docs.find(d => d.id === 'lists');
       const data = listDoc?.data() as any; 
       return data?.[docId] || []; 
    }
    const docData = d.docs.find(d => d.id === docId);
    if (docData && docData.exists()) {
        const data = docData.data() as any;
        return data.list || [];
    }
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
    const q = query(collection(db, LOGS_COL), where('operatorName', '==', operatorName));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => { batch.delete(doc.ref); });
    await batch.commit();
    return true;
  } catch (error) { return false; }
};

export const getProductivityTarget = async (): Promise<number> => {
  try {
    const d = await getDocs(collection(db, CONFIG_COL));
    const targetDoc = d.docs.find(d => d.id === 'targets' || d.id === 'productivity_target');
    if (targetDoc && targetDoc.exists()) {
       const data = targetDoc.data() as any;
       return data.value || data.dailyTarget || DEFAULT_TARGET;
    }
    return DEFAULT_TARGET;
  } catch (e) { return DEFAULT_TARGET; }
};

export const saveProductivityTarget = async (value: number) => {
  await setDoc(doc(db, CONFIG_COL, 'targets'), { dailyTarget: value }, { merge: true });
};

// --- GESTIÓN DE PINs DE OPERARIOS (NUEVO) ---
export const setOperatorPin = async (operatorName: string, pin: string) => {
  // Guardamos el PIN en un documento separado 'auth_pins' para no mezclarlo con la lista pública
  await setDoc(doc(db, CONFIG_COL, 'auth_pins'), { [operatorName]: pin }, { merge: true });
};

export const verifyOperatorPin = async (operatorName: string, inputPin: string): Promise<boolean> => {
  try {
    const docRef = doc(db, CONFIG_COL, 'auth_pins');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const correctPin = data[operatorName];
      // Si no tiene PIN configurado, dejamos pasar (o podrías exigir '0000')
      if (!correctPin) return true; 
      return correctPin === inputPin;
    }
    return true; // Si no existe el documento de PINs, paso libre (hasta que configures)
  } catch (e) {
    console.error("Error verificando PIN", e);
    return false;
  }
};

// 5. MATRIZ DE PUNTOS
export const getPointsMatrix = async (forceRefresh = false): Promise<PointRule[]> => {
  try {
    if (!forceRefresh) {
      const cachedData = localStorage.getItem('cached_matrix');
      const cachedTime = localStorage.getItem('cached_matrix_time');
      if (cachedData && cachedTime) {
        const now = new Date().getTime();
        if (now - parseInt(cachedTime) < 24 * 60 * 60 * 1000) return JSON.parse(cachedData);
      }
    }
    const snapshot = await getDocs(collection(db, MATRIX_COL));
    if (snapshot.empty) return [];
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PointRule));
    try {
      localStorage.setItem('cached_matrix', JSON.stringify(data));
      localStorage.setItem('cached_matrix_time', new Date().getTime().toString());
    } catch (e) {}
    return data;
  } catch (error) { return []; }
};

export const addPointRule = async (rule: PointRule) => {
  const { id, ...data } = rule;
  await addDoc(collection(db, MATRIX_COL), data);
  localStorage.removeItem('cached_matrix');
};

export const updatePointRule = async (rule: PointRule) => {
  const { id, ...data } = rule;
  await updateDoc(doc(db, MATRIX_COL, id!), data);
  localStorage.removeItem('cached_matrix');
};

export const deletePointRule = async (id: string) => {
  await deleteDoc(doc(db, MATRIX_COL, id));
  localStorage.removeItem('cached_matrix');
};

export const getPointRuleSync = (matrix: PointRule[], sector: Sector | string, model: string, operation: string) => {
  return matrix.find(r => r.sector === sector && r.model === model && r.operation === operation);
};

export const calculatePointsSync = (matrix: PointRule[], sector: Sector, model: string, operation: string, quantity: number) => {
  const rule = getPointRuleSync(matrix, sector, model, operation);
  return rule ? rule.pointsPerUnit * quantity : 0;
};

// 6. NOTICIAS
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

// 7. EXPORTACIONES
export const downloadCSV = (logs: ProductionLog[], filename: string) => {
  if (logs.length === 0) { alert("No hay datos."); return; }
  const delimiter = ";"; 
  const headers = ["ID", "Fecha", "Orden", "Operario", "Sector", "Modelo", "Operacion", "Cantidad", "Total Puntos", "Comentarios"];
  const rows = logs.map(log => [
    log.id, new Date(log.timestamp).toLocaleDateString(), log.orderNumber || '-',
    `"${log.operatorName}"`, log.sector, log.model, log.operation, log.quantity,
    log.totalPoints.toFixed(2).replace('.', ','), `"${log.comments || ''}"` 
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
  doc.setFontSize(18); doc.text("Reporte de Producción - TopSafe", 14, 15);
  doc.setFontSize(12); doc.text(title, 14, 22);
  const totalQty = logs.reduce((acc, l) => acc + l.quantity, 0);
  const totalPts = logs.reduce((acc, l) => acc + l.totalPoints, 0);
  doc.setFontSize(10); doc.text(`Total Unidades: ${totalQty} | Total Puntos: ${totalPts.toFixed(1)}`, 14, 28);
  const tableRows = logs.map(log => [
    new Date(log.timestamp).toLocaleDateString(), log.orderNumber || '-', log.operatorName, log.model, log.operation, log.quantity, log.totalPoints.toFixed(1), log.comments ? log.comments.substring(0, 15) + '...' : '-' 
  ]);
  autoTable(doc, { head: [["Fecha", "Orden", "Operario", "Modelo", "Op", "Cant", "Pts", "Obs."]], body: tableRows, startY: 35, theme: 'grid', styles: { fontSize: 8 } });
  doc.save(`${filename}.pdf`);
};

// 8. RESTAURACIÓN
export const restoreSystemFromBackup = async (backupData: any) => {
  try {
    const batch = writeBatch(db);
    if (backupData.config) {
      if (backupData.config.operators) await saveOperators(backupData.config.operators);
      if (backupData.config.models) await saveModels(backupData.config.models);
      if (backupData.config.operations) await saveOperations(backupData.config.operations);
    }
    if (backupData.matrix && Array.isArray(backupData.matrix)) {
      for (const rule of backupData.matrix) {
        const ref = rule.id ? doc(db, 'points_matrix', rule.id) : doc(collection(db, 'points_matrix'));
        const { id, ...data } = rule; 
        await setDoc(ref, data, { merge: true });
      }
    }
    if (backupData.news && Array.isArray(backupData.news)) {
      for (const item of backupData.news) {
        const ref = doc(db, 'news', item.id);
        const { id, ...data } = item; 
        await setDoc(ref, data, { merge: true });
      }
    }
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

export const recalculateAllHistory = async () => {
  try {
    console.log("🔄 Iniciando recálculo masivo...");
    const allLogsQuery = query(collection(db, LOGS_COL), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(allLogsQuery);
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionLog));
    const matrix = await getPointsMatrix(true);
    const batch = writeBatch(db);
    let updateCount = 0;
    let batchCount = 0;

    for (const log of logs) {
      const rule = matrix.find(r => r.sector === log.sector && r.model === log.model && r.operation === log.operation);
      if (rule) {
        const correctPoints = rule.pointsPerUnit * log.quantity;
        if (Math.abs(correctPoints - log.totalPoints) > 0.01) {
          const ref = doc(db, LOGS_COL, log.id!);
          batch.update(ref, { totalPoints: correctPoints, points: correctPoints });
          updateCount++;
          batchCount++;
        }
      }
      if (batchCount >= 400) { await batch.commit(); batchCount = 0; }
    }
    if (batchCount > 0) { await batch.commit(); }
    return updateCount; 
  } catch (error) {
    console.error("Error en recálculo:", error);
    throw error;
  }
};
