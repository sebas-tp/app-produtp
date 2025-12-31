import { ProductionLog } from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";

// CORRECCIÓN: Usamos (import.meta as any) para evitar errores de TypeScript en Vercel
const API_KEY = (import.meta as any).env.VITE_GOOGLE_AI_KEY;

export const analyzeProductionData = async (
  logs: ProductionLog[], 
  allLogs: ProductionLog[], 
  operators: string[], 
  selectedOperator: string,
  dailyTarget: number 
): Promise<string> => {
  
  if (!API_KEY) return "⚠️ Error: No se detectó la API Key de Google. Configura VITE_GOOGLE_AI_KEY en Vercel.";

  // Simulación de espera para UX
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (logs.length === 0) return "No hay datos suficientes para analizar.";

  // --- 1. PREPARACIÓN DE DATOS MATEMÁTICOS ---

  const uniqueDays = new Set(logs.map(l => l.timestamp.split('T')[0])).size || 1;
  const totalPoints = logs.reduce((sum, log) => sum + log.totalPoints, 0);
  const avgDailyPoints = totalPoints / uniqueDays;
  const efficiency = (avgDailyPoints / dailyTarget) * 100;

  // Métricas Globales
  const datesInFilter = new Set(logs.map(l => l.timestamp.split('T')[0]));
  const globalLogsInPeriod = allLogs.filter(l => datesInFilter.has(l.timestamp.split('T')[0]));
  const globalTotalPoints = globalLogsInPeriod.reduce((sum, l) => sum + l.totalPoints, 0);
  const operatorDaysCount = new Set(globalLogsInPeriod.map(l => `${l.operatorName}-${l.timestamp.split('T')[0]}`)).size || 1;
  const plantAverageDaily = globalTotalPoints / operatorDaysCount;

  // Ranking Operarios
  const opStats: Record<string, number> = {};
  globalLogsInPeriod.forEach(l => { opStats[l.operatorName] = (opStats[l.operatorName] || 0) + l.totalPoints; });
  const opAverageDaily: Record<string, number> = {};
  Object.keys(opStats).forEach(opName => {
    const daysWorked = new Set(globalLogsInPeriod.filter(l => l.operatorName === opName).map(l => l.timestamp.split('T')[0])).size || 1;
    opAverageDaily[opName] = opStats[opName] / daysWorked;
  });
  
  const sortedOps = Object.entries(opAverageDaily).sort((a, b) => b[1] - a[1]);
  
  // CORRECCIÓN: Tipos por defecto para evitar errores si el array está vacío
  const topPerformer = sortedOps.length > 0 ? sortedOps[0] : ["N/A", 0];
  const bottomPerformer = sortedOps.length > 0 ? sortedOps[sortedOps.length - 1] : ["N/A", 0];

  // Cuellos de Botella
  const sectorStats: Record<string, number> = {};
  logs.forEach(l => { sectorStats[l.sector] = (sectorStats[l.sector] || 0) + l.totalPoints; });
  const sortedSectors = Object.entries(sectorStats).sort((a, b) => a[1] - b[1]); 
  const weakSector = sortedSectors.length > 0 ? sortedSectors[0][0] : "N/A";
  const strongSector = sortedSectors.length > 0 ? sortedSectors[sortedSectors.length - 1][0] : "N/A";

  // --- 2. CONSTRUCCIÓN DEL PROMPT ---
  
  let promptContext = "";

  // CORRECCIÓN: Usamos Number() para asegurar que son números
  const topScore = Number(topPerformer[1]);
  const bottomScore = Number(bottomPerformer[1]);

  if (selectedOperator === 'all') {
    promptContext = `
      ESTÁS ANALIZANDO A TODA LA PLANTA (GLOBAL).
      - Eficiencia Promedio Planta: ${((plantAverageDaily / dailyTarget) * 100).toFixed(1)}%
      - Meta Diaria: ${dailyTarget} pts
      - Mejor Operario: ${topPerformer[0]} (${topScore.toFixed(0)} pts/día)
      - Peor Operario: ${bottomPerformer[0]} (${bottomScore.toFixed(0)} pts/día)
      - Sector más débil (Cuello de botella): ${weakSector}
    `;
  } else {
    const diffVsAverage = ((avgDailyPoints - plantAverageDaily) / plantAverageDaily) * 100;
    promptContext = `
      ESTÁS ANALIZANDO AL OPERARIO: ${selectedOperator.toUpperCase()}.
      - Su Promedio: ${avgDailyPoints.toFixed(0)} pts/día
      - Meta Diaria: ${dailyTarget} pts
      - Su Eficiencia Personal: ${efficiency.toFixed(1)}%
      - Comparación vs Promedio Planta: ${diffVsAverage > 0 ? '+' : ''}${diffVsAverage.toFixed(1)}%
      - Su Sector más fuerte: ${strongSector}
      - Su Sector más débil: ${weakSector}
    `;
  }

  const fullPrompt = `
    Actúa como un Ingeniero Industrial Senior y Gerente de Planta experto en eficiencia operativa y recursos humanos.
    
    Analiza los siguientes datos de producción reales:
    ${promptContext}

    Instrucciones de respuesta:
    1. Usa formato Markdown (negritas, listas).
    2. Sé profesional pero directo. Usa emojis para resaltar puntos clave (🧠, ⚠️, 🚀).
    3. Si la eficiencia es baja (<80%), sé crítico y sugiere causas.
    4. Si la eficiencia es alta (>100%), sugiere premios o mentoría.
    5. NO inventes números.
    6. Estructura: "Diagnóstico", "Análisis de Datos", "3 Acciones Recomendadas".
  `;

  // --- 3. LLAMADA A GEMINI ---
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
    
  } catch (error) {
    console.error("Error llamando a Gemini:", error);
    return "❌ Error al conectar con la Inteligencia Artificial. Verifica la consola para más detalles.";
  }
};
