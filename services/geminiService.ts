import { GoogleGenAI } from "@google/genai";
import { ProductionLog } from "../types";

// Initialize the API client
const apiKey = process.env.API_KEY || ''; // Fail gracefully if no key
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const analyzeProductionData = async (logs: ProductionLog[]): Promise<string> => {
  if (!ai) {
    return "API Key de Gemini no configurada. Por favor configure process.env.API_KEY para habilitar el análisis IA.";
  }

  if (logs.length === 0) {
    return "No hay suficientes datos para realizar un análisis.";
  }

  // Preparamos un resumen ligero para no exceder tokens
  const summaryData = logs.slice(0, 50).map(l => 
    `Op: ${l.operatorName}, Sec: ${l.sector}, Pts: ${l.totalPoints}, Cant: ${l.quantity}`
  ).join('\n');

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Actúa como un Gerente de Planta Industrial experto. Analiza estos registros de producción recientes:
      
      ${summaryData}
      
      Identifica:
      1. Patrones de alta eficiencia.
      2. Posibles cuellos de botella o anomalías.
      3. Una recomendación breve para mejorar la productividad.
      
      Responde en formato Markdown, corto y directo.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    return response.text || "No se pudo generar el análisis.";
  } catch (error) {
    console.error("Error analizando datos:", error);
    return "Error al conectar con el servicio de IA.";
  }
};