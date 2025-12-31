import { ProductionLog } from '../types';

// 1. OBTENCIÓN DE CLAVE SEGURA
const API_KEY = (import.meta as any).env.VITE_GOOGLE_AI_KEY;

export const analyzeProductionData = async (
  logs: ProductionLog[], 
  allLogs: ProductionLog[], 
  operators: string[], 
  selectedOperator: string,
  dailyTarget: number 
): Promise<string> => {
  
  if (!API_KEY) return "⚠️ Error: No se detectó la API Key. Configura VITE_GOOGLE_AI_KEY en Vercel.";

  // Espera estética
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (logs.length === 0) return "No hay datos suficientes para analizar.";

  // --- PREPARACIÓN DE DATOS (Misma lógica matemática) ---
  const uniqueDays = new Set(logs.map(l => l.timestamp.split('T')[0])).size || 1;
  const totalPoints = logs.reduce((sum, log) => sum + log.totalPoints, 0);
  const avgDailyPoints = totalPoints / uniqueDays;
  const efficiency = (avgDailyPoints / dailyTarget) * 100;

  const datesInFilter = new Set(logs.map(l => l.timestamp.split('T')[0]));
  const globalLogsInPeriod = allLogs.filter(l => datesInFilter.has(l.timestamp.split('T')[0]));
  const globalTotalPoints = globalLogsInPeriod.reduce((sum, l) => sum + l.totalPoints, 0);
  const operatorDaysCount = new Set(globalLogsInPeriod.map(l => `${l.operatorName}-${l.timestamp.split('T')[0]}`)).size || 1;
  const plantAverageDaily = globalTotalPoints / operatorDaysCount;

  const opStats: Record<string, number> = {};
  globalLogsInPeriod.forEach(l => { opStats[l.operatorName] = (opStats[l.operatorName] || 0) + l.totalPoints; });
  const opAverageDaily: Record<string, number> = {};
  Object.keys(opStats).forEach(opName => {
    const daysWorked = new Set(globalLogsInPeriod.filter(l => l.operatorName === opName).map(l => l.timestamp.split('T')[0])).size || 1;
    opAverageDaily[opName] = opStats[opName] / daysWorked;
  });
  
  const sortedOps = Object.entries(opAverageDaily).sort((a, b) => b[1] - a[1]);
  const topPerformer = sortedOps.length > 0 ? sortedOps[0] : ["N/A", 0];
  const bottomPerformer = sortedOps.length > 0 ? sortedOps[sortedOps.length - 1] : ["N/A", 0];

  const sectorStats: Record<string, number> = {};
  logs.forEach(l => { sectorStats[l.sector] = (sectorStats[l.sector] || 0) + l.totalPoints; });
  const sortedSectors = Object.entries(sectorStats).sort((a, b) => a[1] - b[1]); 
  const weakSector = sortedSectors.length > 0 ? sortedSectors[0][0] : "N/A";
  const strongSector = sortedSectors.length > 0 ? sortedSectors[sortedSectors.length - 1][0] : "N/A";

  // --- PROMPT ---
  let promptContext = "";
  const topScore = Number(topPerformer[1]);
  const bottomScore = Number(bottomPerformer[1]);

  if (selectedOperator === 'all') {
    promptContext = `
      ESTÁS ANALIZANDO A TODA LA PLANTA (GLOBAL).
      - Eficiencia Promedio: ${((plantAverageDaily / dailyTarget) * 100).toFixed(1)}%
      - Meta: ${dailyTarget} pts
      - Mejor: ${topPerformer[0]} (${topScore.toFixed(0)} pts)
      - Peor: ${bottomPerformer[0]} (${bottomScore.toFixed(0)} pts)
      - Sector Débil: ${weakSector}
    `;
  } else {
    const diffVsAverage = ((avgDailyPoints - plantAverageDaily) / plantAverageDaily) * 100;
    promptContext = `
      OPERARIO: ${selectedOperator.toUpperCase()}.
      - Promedio: ${avgDailyPoints.toFixed(0)} pts
      - Eficiencia: ${efficiency.toFixed(1)}%
      - Vs Planta: ${diffVsAverage > 0 ? '+' : ''}${diffVsAverage.toFixed(1)}%
      - Sector Fuerte: ${strongSector}
      - Sector Débil: ${weakSector}
    `;
  }

  const fullPrompt = `
    Actúa como Gerente de Planta. Analiza estos datos:
    ${promptContext}
    
    Dame un reporte breve en Markdown:
    1. Diagnóstico (con emojis).
    2. Análisis de Datos.
    3. 3 Acciones Recomendadas.
  `;

  // --- LLAMADA DIRECTA (SIN LIBRERÍA, MODELO "GEMINI-PRO") ---
  try {
    // CAMBIO IMPORTANTE: Usamos 'gemini-pro' en lugar de 'flash'. Este modelo SIEMPRE está disponible.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }]
        })
      }
    );

    if (!response.ok) {
       const errorData = await response.json();
       // Esto nos dirá exactamente qué pasa si vuelve a fallar
       throw new Error(errorData.error?.message || `Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    // Verificamos que la respuesta tenga la estructura correcta
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
    } else {
        return "⚠️ La IA respondió, pero no generó texto. Intenta de nuevo.";
    }

  } catch (error) {
    console.error("Error Gemini REST:", error);
    return `❌ Error de conexión con IA: ${(error as any).message || "Desconocido"}.`;
  }
};
