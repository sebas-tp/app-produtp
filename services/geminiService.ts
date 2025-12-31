import { ProductionLog } from '../types';

// OBTENCIÓN DE CLAVE SEGURA
const API_KEY = (import.meta as any).env.VITE_GOOGLE_AI_KEY;

export const analyzeProductionData = async (
  logs: ProductionLog[], 
  allLogs: ProductionLog[], 
  operators: string[], 
  selectedOperator: string,
  dailyTarget: number 
): Promise<string> => {
  
  // 1. Validaciones
  if (!API_KEY) return "⚠️ Error: No se detectó la API Key. Revisa las variables en Vercel.";
  if (logs.length === 0) return "No hay datos suficientes para analizar.";

  // Espera estética
  await new Promise(resolve => setTimeout(resolve, 1500));

  // --- 2. CÁLCULOS MATEMÁTICOS (Tu lógica intacta) ---
  const uniqueDays = new Set(logs.map(l => l.timestamp.split('T')[0])).size || 1;
  const totalPoints = logs.reduce((sum, log) => sum + log.totalPoints, 0);
  const avgDailyPoints = totalPoints / uniqueDays;
  const efficiency = (avgDailyPoints / dailyTarget) * 100;

  // Globales
  const datesInFilter = new Set(logs.map(l => l.timestamp.split('T')[0]));
  const globalLogsInPeriod = allLogs.filter(l => datesInFilter.has(l.timestamp.split('T')[0]));
  const globalTotalPoints = globalLogsInPeriod.reduce((sum, l) => sum + l.totalPoints, 0);
  const operatorDaysCount = new Set(globalLogsInPeriod.map(l => `${l.operatorName}-${l.timestamp.split('T')[0]}`)).size || 1;
  const plantAverageDaily = globalTotalPoints / operatorDaysCount;

  // Ranking y Sectores
  const sectorStats: Record<string, number> = {};
  logs.forEach(l => { sectorStats[l.sector] = (sectorStats[l.sector] || 0) + l.totalPoints; });
  const sortedSectors = Object.entries(sectorStats).sort((a, b) => a[1] - b[1]); 
  const weakSector = sortedSectors.length > 0 ? sortedSectors[0][0] : "N/A";
  const strongSector = sortedSectors.length > 0 ? sortedSectors[sortedSectors.length - 1][0] : "N/A";

  // --- 3. PROMPT PARA LA IA ---
  const diffVsAverage = ((avgDailyPoints - plantAverageDaily) / plantAverageDaily) * 100;
  
  let promptContext = "";
  if (selectedOperator === 'all') {
    promptContext = `
      ESTÁS ANALIZANDO A TODA LA PLANTA (GLOBAL).
      - Eficiencia Promedio Planta: ${((plantAverageDaily / dailyTarget) * 100).toFixed(1)}% (Meta: ${dailyTarget})
      - Sector con menos producción: ${weakSector}
      - Sector con más producción: ${strongSector}
    `;
  } else {
    promptContext = `
      OPERARIO: ${selectedOperator.toUpperCase()}.
      - Promedio diario: ${avgDailyPoints.toFixed(0)} pts
      - Eficiencia personal: ${efficiency.toFixed(1)}% (Meta: ${dailyTarget})
      - Comparación vs Planta: ${diffVsAverage > 0 ? '+' : ''}${diffVsAverage.toFixed(1)}%
      - Sector más fuerte: ${strongSector}
      - Sector a mejorar: ${weakSector}
    `;
  }

  const fullPrompt = `
    Actúa como un Ingeniero Industrial experto. Analiza estos datos reales:
    ${promptContext}

    Genera un informe breve y motivador en formato Markdown:
    1. **Diagnóstico 🧠**: Estado actual y rendimiento.
    2. **Análisis 📊**: Interpretación de los números.
    3. **3 Acciones Recomendadas 🚀**: Consejos prácticos para mejorar.
    
    Sé directo, profesional y usa emojis. No inventes datos.
  `;

  // --- 4. CONEXIÓN DIRECTA (fetch) ---
  try {
    // Usamos 'gemini-pro' que es súper estable
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
       const errorMessage = errorData.error?.message || `Error HTTP: ${response.status}`;
       console.error("Error Detallado Gemini:", errorMessage);
       return `❌ Error de IA: ${errorMessage}`;
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
    } else {
        return "⚠️ La IA respondió correctamente, pero no generó texto. Intenta de nuevo.";
    }

  } catch (error) {
    console.error("Error Gemini REST:", error);
    return `❌ Error de conexión: ${(error as any).message || "Revisa tu internet"}.`;
  }
};
