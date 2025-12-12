export enum Sector {
  CORTE = 'Corte',
  ARMADO = 'Armado',
  COSTURA = 'Costura',
  MONTAJE = 'Montaje',
  LIMPIEZA = 'Limpieza',
  EMBALAJE = 'Embalaje',
}

export interface PointRule {
  id?: string; // Added for UI management
  sector: Sector;
  model: string;
  operation: string;
  pointsPerUnit: number;
}

export interface ProductionLog {
  id: string;
  timestamp: string; // ISO String
  startTime: string;
  endTime: string;
  operatorName: string;
  sector: Sector;
  model: string;
  operation: string;
  quantity: number;
  totalPoints: number;
}

export interface DashboardStats {
  totalProduction: number;
  totalPoints: number;
  topOperator: { name: string; points: number } | null;
  efficiencyBySector: { name: string; value: number }[];
}

export type UserRole = 'admin' | 'operator';

export interface User {
  name: string;
  role: UserRole;
}