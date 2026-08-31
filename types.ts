export enum GrowStage {
  // Declaration order drives the stage selector, so prep comes first.
  SOIL_PREP = 'Soil Prep',
  SEEDLING = 'Seedling',
  VEGETATIVE = 'Vegetative',
  FLOWERING = 'Flowering',
  CURING = 'Curing'
}

export type TaskCategory = 'Environment' | 'Feeding' | 'Training' | 'Observation';

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  category: TaskCategory;
  stage: GrowStage;
  /** ISO yyyy-mm-dd. Set when the model schedules the task against the grow calendar. */
  dueDate?: string;
  /** Why this task matters for *this* location/forecast right now. */
  localRationale?: string;
  createdAt: number;
}

/** Where the grow physically lives. Drives climate, daylight and season context. */
export interface GrowLocation {
  latitude: number;
  longitude: number;
  /** Human label, e.g. "Christchurch, Canterbury" */
  label: string;
  country: string;
  countryCode: string;
  timezone: string;
  elevation?: number;
  source: 'gps' | 'search' | 'manual';
}

export interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  precipitationProbability: number;
  humidityMean: number;
  humidityNightMean: number;
  windMax: number;
  uvIndexMax: number;
  daylightHours: number;
  sunrise: string;
  sunset: string;
  weatherLabel: string;
}

export interface LocalClimate {
  fetchedAt: number;
  timezone: string;
  current: {
    temperature: number;
    humidity: number;
    apparentTemperature: number;
    precipitation: number;
    windSpeed: number;
    isDay: boolean;
    weatherLabel: string;
  };
  today: DailyForecast;
  forecast: DailyForecast[];
  derived: ClimateInsights;
}

export interface ClimateInsights {
  /** Leaf-temperature-adjusted vapour pressure deficit, kPa. */
  vpd: number;
  vpdVerdict: string;
  vpdTargetForStage: string;
  dayLengthHours: number;
  dayLengthTrend: 'lengthening' | 'shortening';
  /** Dates the natural photoperiod crosses the flowering thresholds. */
  crosses14h: string | null;
  crosses12h: string | null;
  frostRiskDays: string[];
  heatStressDays: string[];
  moldRiskDays: string[];
  hemisphere: 'Northern' | 'Southern';
  season: string;
}

export interface StrainRange {
  min: number;
  max: number;
}

export interface StrainProfile {
  name: string;
  breeder: string;
  type: string;
  lineage: string;
  photoperiodOrAuto: 'Photoperiod' | 'Autoflower' | 'Unknown';
  thcRange: string;
  cbdRange: string;
  terpenes: string[];
  aromaFlavor: string;
  effects: string[];
  floweringDays: StrainRange;
  seedToHarvestDays: StrainRange | null;
  stretchFactor: string;
  heightNote: string;
  yieldIndoor: string;
  yieldOutdoor: string;
  difficulty: string;
  feeding: {
    ecRange: string;
    phRange: string;
    nitrogenAppetite: string;
    calMag: string;
    notes: string;
  };
  climate: {
    idealTempC: string;
    idealRhVeg: string;
    idealRhFlower: string;
    moldResistance: string;
    coldTolerance: string;
    heatTolerance: string;
  };
  trainingTips: string[];
  commonIssues: string[];
  harvestWindow: string;
  /** The strain expert crossed with the grower's actual coordinates. */
  locationFit: {
    score: number;
    verdict: string;
    reasoning: string;
    adjustments: string[];
    outdoorPlantOutWindow: string;
    outdoorHarvestWindow: string;
  };
  confidence: 'High' | 'Medium' | 'Low';
  sourceNote: string;
  generatedAt: number;
}

export type GrowEventKind = 'stage' | 'milestone' | 'task' | 'risk';

export interface GrowEvent {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  title: string;
  description: string;
  kind: GrowEventKind;
  stage?: GrowStage;
  taskId?: string;
}

export interface GrowSchedule {
  /** Germination / day one, ISO yyyy-mm-dd */
  startDate: string;
  /** When medium and system prep should begin — before day one. */
  prepStartDate: string;
  vegDays: number;
  floweringDays: number;
  dryDays: number;
  cureDays: number;
  flipDate: string;
  harvestDate: string;
  jarDate: string;
  dayOfGrow: number;
  events: GrowEvent[];
}

export interface UserSetup {
  method: string; // e.g., Soil, Coco, DWC
  environment: string; // e.g., Indoor Tent, Outdoor, Greenhouse
  strainType: string; // e.g., Photoperiod, Autoflower
  experienceLevel: string; // e.g., Novice, Intermediate, Expert
  /** Named cultivar the strain expert profiles, e.g. "Blue Dream". */
  strainName: string;
  location: GrowLocation | null;
  /** ISO yyyy-mm-dd of germination. */
  startDate: string;
  /** Planned days in veg before the flip (photoperiod, indoor). */
  vegDays: number;
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
  /** How the local forecast/climate contributed to this problem. */
  localFactor?: string;
}
