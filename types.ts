export enum GrowStage {
  SEEDLING = 'Seedling',
  VEGETATIVE = 'Vegetative',
  FLOWERING = 'Flowering',
  CURING = 'Curing'
}

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  category: 'Environment' | 'Feeding' | 'Training' | 'Observation';
}

export interface UserSetup {
  method: string; // e.g., Soil, Coco, DWC
  environment: string; // e.g., Indoor Tent, Outdoor, Greenhouse
  strainType: string; // e.g., Photoperiod, Autoflower
  experienceLevel: string; // e.g., Novice, Intermediate, Expert
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface DiagnosisResult {
  issue: string;
  analysis: string;
  actions: string[];
}
