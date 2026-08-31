import { GoogleGenAI, Type } from "@google/genai";
import {
  GrowStage,
  UserSetup,
  Task,
  DiagnosisResult,
  LocalClimate,
  StrainProfile,
  GrowSchedule
} from "../types";
import { daysBetween, formatHours } from "./solar";
import { daylightOutlook, VPD_TARGETS } from "./weather";
import { upcomingEvents } from "./calendar";

const MODEL = 'gemini-3-flash-preview';

const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

/** Everything the model needs to stop giving generic forum advice. */
export interface GrowContext {
  setup: UserSetup;
  stage: GrowStage;
  climate: LocalClimate | null;
  strain: StrainProfile | null;
  schedule: GrowSchedule | null;
}

/**
 * What each stage is actually about. Prep especially needs spelling out — the
 * model will happily give plant-care advice for a stage with no plants in it.
 */
const STAGE_BRIEFS: Record<GrowStage, string> = {
  [GrowStage.SOIL_PREP]:
    'Nothing is planted yet. Every recommendation must be about getting the medium, containers, water and space ready: amending and buffering, pH and EC of the medium or reservoir before anything goes in, container size and drainage, sterilising equipment, and bringing root-zone temperature to 18–24°C. Do not give plant-care, feeding-schedule or training advice — there is no plant.',
  [GrowStage.SEEDLING]:
    'Fragile roots, tiny water demand. Focus on humidity, gentle light, and not overwatering.',
  [GrowStage.VEGETATIVE]:
    'Building structure and root mass. Focus on training, nitrogen availability and canopy shape.',
  [GrowStage.FLOWERING]:
    'Bud development. Focus on stretch control, phosphorus and potassium, airflow and mould prevention.',
  [GrowStage.CURING]:
    'Harvested material. Focus on drying rate, humidity control, burping and storage — not on living plants.'
};

const formatList = (values: string[], limit = 4): string =>
  values.length ? values.slice(0, limit).join(', ') + (values.length > limit ? ` (+${values.length - limit} more)` : '') : 'none';

/**
 * Turn the grower's coordinates and forecast into prose the model can reason
 * over. Raw JSON works less well here — the model reliably picks up "frost on
 * Tuesday" phrasing and folds it into advice.
 */
const locationBlock = (setup: UserSetup, climate: LocalClimate | null): string => {
  const { location } = setup;
  if (!location) {
    return `LOCATION: not set. Do not guess at climate, season or daylight. If a question depends on local conditions, say what you would need to know.`;
  }

  const head =
    `LOCATION\n` +
    `- Site: ${location.label}${location.country ? `, ${location.country}` : ''} (${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)})\n` +
    `- Timezone: ${location.timezone}${location.elevation != null ? ` | Elevation: ${Math.round(location.elevation)} m` : ''}\n` +
    `- Daylight: ${daylightOutlook(location)}`;

  if (!climate) return head + `\n- Live weather unavailable; reason from the latitude and the date.`;

  const d = climate.derived;
  const week = climate.forecast.slice(0, 7);
  const weekMin = Math.min(...week.map((f) => f.tempMin));
  const weekMax = Math.max(...week.map((f) => f.tempMax));
  const wetDays = week.filter((f) => f.precipitation >= 1).length;

  return (
    head + '\n' +
    `- Hemisphere / season: ${d.hemisphere}, ${d.season}\n` +
    `- Right now outside: ${climate.current.temperature}°C, ${climate.current.humidity}% RH, ${climate.current.weatherLabel.toLowerCase()}, wind ${climate.current.windSpeed} km/h\n` +
    `- Today: ${climate.today.tempMin}°C to ${climate.today.tempMax}°C, ${formatHours(climate.today.daylightHours)} of daylight (${climate.today.sunrise}–${climate.today.sunset}), UV max ${climate.today.uvIndexMax}\n` +
    `- Next 7 days: ${weekMin}°C to ${weekMax}°C, ${wetDays} day(s) with meaningful rain, overnight RH averaging ${Math.round(week.reduce((s, f) => s + f.humidityNightMean, 0) / week.length)}%\n` +
    `- Outdoor leaf VPD right now: ${d.vpd} kPa — ${d.vpdVerdict}\n` +
    `- Natural photoperiod is ${d.dayLengthTrend}` +
    (d.crosses14h ? `; drops under 14h on ${d.crosses14h} (outdoor photoperiods start flowering)` : '') +
    (d.crosses12h ? ` and under 12h on ${d.crosses12h}` : '') + '\n' +
    `- Frost-risk days in forecast: ${formatList(d.frostRiskDays)}\n` +
    `- Heat-stress days (≥30°C): ${formatList(d.heatStressDays)}\n` +
    `- High overnight humidity (bud-rot risk) days: ${formatList(d.moldRiskDays)}`
  );
};

const strainBlock = (setup: UserSetup, strain: StrainProfile | null): string => {
  if (!strain) {
    return setup.strainName
      ? `STRAIN: "${setup.strainName}" — no profile loaded yet. Use general knowledge of this cultivar and flag uncertainty.`
      : `STRAIN: not specified. Give advice that holds across cultivars, and say when a strain-specific answer would differ.`;
  }

  return (
    `STRAIN — ${strain.name}${strain.breeder ? ` (${strain.breeder})` : ''}\n` +
    `- Type: ${strain.type} | ${strain.photoperiodOrAuto} | Lineage: ${strain.lineage}\n` +
    `- Flowering: ${strain.floweringDays.min}–${strain.floweringDays.max} days | Stretch: ${strain.stretchFactor} | ${strain.heightNote}\n` +
    `- Feeding: EC ${strain.feeding.ecRange}, pH ${strain.feeding.phRange}, nitrogen appetite ${strain.feeding.nitrogenAppetite}, CalMag ${strain.feeding.calMag}\n` +
    `- Climate fit: ideal ${strain.climate.idealTempC}, RH ${strain.climate.idealRhVeg} veg / ${strain.climate.idealRhFlower} flower, mould resistance ${strain.climate.moldResistance}, cold tolerance ${strain.climate.coldTolerance}, heat tolerance ${strain.climate.heatTolerance}\n` +
    `- Known weak points: ${formatList(strain.commonIssues, 5)}\n` +
    `- Terpenes: ${formatList(strain.terpenes, 5)} | Harvest window: ${strain.harvestWindow}\n` +
    `- Fit at this location: ${strain.locationFit.verdict} (${strain.locationFit.score}/10) — ${strain.locationFit.reasoning}`
  );
};

const calendarBlock = (setup: UserSetup, schedule: GrowSchedule | null): string => {
  if (!schedule) return 'CALENDAR: not initialised.';

  const today = new Date().toISOString().split('T')[0];
  const toHarvest = daysBetween(today, schedule.harvestDate);
  const upcoming = upcomingEvents(schedule, 14);

  return (
    `GROW CALENDAR (today is ${today})\n` +
    (schedule.dayOfGrow >= 1
      ? `- Day ${schedule.dayOfGrow} of this grow (germinated ${schedule.startDate})\n`
      : `- Not germinated yet — planting is set for ${schedule.startDate}, ${1 - schedule.dayOfGrow} day(s) away. Prep started ${schedule.prepStartDate}.\n`) +
    `- Flip / flower start: ${schedule.flipDate} | Projected harvest: ${schedule.harvestDate} (${toHarvest >= 0 ? `${toHarvest} days out` : `${Math.abs(toHarvest)} days ago`})\n` +
    `- Jars ready: ${schedule.jarDate}\n` +
    `- Next 14 days on the calendar:\n` +
    (upcoming.length
      ? upcoming.map((e) => `  • ${e.date} — ${e.title}`).join('\n')
      : '  • nothing scheduled')
  );
};

export const buildContext = (ctx: GrowContext): string => {
  const { setup, stage } = ctx;
  return [
    `GROWER SETUP`,
    `- Medium: ${setup.method} | Environment: ${setup.environment} | Seed type: ${setup.strainType}`,
    `- Experience: ${setup.experienceLevel}`,
    `- Current stage: ${stage} (VPD target ${VPD_TARGETS[stage].label})`,
    `- What this stage is: ${STAGE_BRIEFS[stage]}`,
    ``,
    locationBlock(setup, ctx.climate),
    ``,
    strainBlock(setup, ctx.strain),
    ``,
    calendarBlock(setup, ctx.schedule)
  ].join('\n');
};

/**
 * Shared rules. The whole point of the location and calendar wiring is that
 * advice references them explicitly, so it is stated as a hard requirement.
 */
const GROUND_RULES = `
HOW TO ANSWER
- Anchor every recommendation in the grower's actual context above: their medium, their strain, their forecast, and where they are in the calendar.
- When the local weather or daylight changes the answer, say so explicitly and name the date or number ("lows hit 1°C on Thursday", "you lose 14h daylight on 12 March").
- Indoor growers are still affected by outside conditions — intake air temperature and humidity, dehumidifier and heater load, and summer heat soak. Do not dismiss the forecast because they are in a tent.
- Prefer concrete numbers (°C and °F, EC and ppm, pH, litres, hours) over adjectives.
- If the context lacks something you need, say what is missing rather than inventing it.
- Do not give legal advice about cultivation. Local law is the grower's responsibility.
`;

export const generateTasksForStage = async (
  stage: GrowStage,
  setup: UserSetup,
  existingTasks: Task[],
  climate: LocalClimate | null = null,
  strain: StrainProfile | null = null,
  schedule: GrowSchedule | null = null
): Promise<Task[]> => {
  if (!apiKey) return [];

  const prompt = `
You are an elite master cannabis cultivator planning the next block of work for one specific grower.

${buildContext({ setup, stage, climate, strain, schedule })}
${GROUND_RULES}

Generate 5 specific, high-impact tasks for the ${stage} stage of THIS grow.

Requirements:
- At least two tasks must be driven by the local forecast or daylight above (heat, cold, humidity, rain, UV, photoperiod).
${stage === GrowStage.SOIL_PREP
  ? `- At least one task must size the setup to ${setup.strainName || 'this cultivar'} — container volume for its root mass and final height, and how rich to build the medium for its feeding appetite.
- Every task must be pre-plant work on the ${setup.method} medium, the containers, the water or the space. Nothing about caring for a plant.`
  : `- At least one task must be specific to ${setup.strainName || 'this cultivar'} — its stretch, flowering length, feeding appetite or known weaknesses.`}
- Schedule each task with "dueInDays": a whole number of days from today (0 = today, max 21) reflecting when it actually needs doing.
- "localRationale" must name the specific local condition or calendar date that makes this task matter now. Leave it empty only if the task is genuinely location-independent.
- Be specific to ${setup.method} (pH and EC targets for that medium, not generic ranges).

Do not repeat these existing tasks: ${existingTasks.map(t => t.title).join(', ') || 'none yet'}.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short, punchy title of the task" },
              description: { type: Type.STRING, description: "1-2 sentences explaining exactly what to do and why, with numbers." },
              category: { type: Type.STRING, enum: ['Environment', 'Feeding', 'Training', 'Observation'] },
              dueInDays: { type: Type.INTEGER, description: "Whole days from today until this should be done (0-21)." },
              localRationale: { type: Type.STRING, description: "The local weather, daylight or calendar fact that makes this urgent. Empty string if none." }
            },
            required: ['title', 'description', 'category', 'dueInDays']
          }
        }
      }
    });

    const data = JSON.parse(response.text || '[]');

    return data.map((item: any) => {
      const due = new Date();
      due.setDate(due.getDate() + Math.max(0, Math.min(21, Number(item.dueInDays) || 0)));

      return {
        id: Math.random().toString(36).slice(2, 11),
        title: item.title,
        description: item.description,
        completed: false,
        category: item.category,
        stage,
        dueDate: due.toISOString().split('T')[0],
        localRationale: item.localRationale || undefined,
        createdAt: Date.now()
      } as Task;
    });

  } catch (error) {
    console.error("Failed to generate tasks:", error);
    return [];
  }
};

export const chatWithGrower = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  setup: UserSetup,
  stage: GrowStage,
  climate: LocalClimate | null = null,
  strain: StrainProfile | null = null,
  schedule: GrowSchedule | null = null
): Promise<string> => {
  if (!apiKey) return "API Key missing.";

  const systemInstruction = `
You are Apex, a no-nonsense cannabis cultivation expert and strain specialist.
You are advising one grower whose exact setup, location, weather and calendar are below. Treat it as ground truth.

${buildContext({ setup, stage, climate, strain, schedule })}
${GROUND_RULES}

Keep answers tight and actionable. Use metric first with imperial in brackets.
If the grower is about to do something risky for their climate or their strain, say so first.
`;

  try {
    const chat = ai.chats.create({
      model: MODEL,
      config: { systemInstruction },
      history: history.map(h => ({ role: h.role, parts: h.parts }))
    });

    const result = await chat.sendMessage({ message });
    return result.text || "I couldn't process that request.";
  } catch (error) {
    console.error("Chat error:", error);
    return "Connection to Apex Core interrupted. Try again.";
  }
};

export const diagnosePlantIssue = async (
  setup: UserSetup,
  stage: GrowStage,
  category: string,
  symptom: string,
  climate: LocalClimate | null = null,
  strain: StrainProfile | null = null,
  schedule: GrowSchedule | null = null
): Promise<DiagnosisResult | null> => {
  if (!apiKey) return null;

  const prompt = `
You are an expert cannabis plant pathologist diagnosing one specific plant.

${buildContext({ setup, stage, climate, strain, schedule })}
${GROUND_RULES}

Problem category: ${category}
Reported symptom: ${symptom}

Work the differential in this order:
1. Could the recent local weather cause this? (cold nights, heat, humidity swings, rain, wind, UV, low light)
2. Is this a known weakness of ${setup.strainName || 'this cultivar'}?
3. Is it a ${setup.method}-specific issue (pH drift, lockout, root oxygen, salt build-up)?
4. Only then consider generic causes.

Return:
- 'issue': the diagnosed problem, named precisely.
- 'analysis': why it is happening for THIS grower, referencing their medium, stage and recent conditions.
- 'localFactor': how their location, weather or season contributed. If it truly did not contribute, say so plainly.
- 'actions': 3 specific, ordered fixes with real numbers, appropriate to their forecast for the coming days.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            issue: { type: Type.STRING },
            analysis: { type: Type.STRING },
            localFactor: { type: Type.STRING },
            actions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['issue', 'analysis', 'actions']
        }
      }
    });

    return JSON.parse(response.text || 'null');
  } catch (error) {
    console.error("Diagnosis error:", error);
    return null;
  }
};

/**
 * The strain expert: a full cultivar profile, then that cultivar scored
 * against the grower's actual latitude and forecast.
 */
export const getStrainProfile = async (
  strainName: string,
  setup: UserSetup,
  climate: LocalClimate | null = null
): Promise<StrainProfile | null> => {
  if (!apiKey) return null;
  if (!strainName.trim()) return null;

  const prompt = `
You are a cannabis strain expert: breeder catalogues, phenotype behaviour and grow reports are your speciality.

Profile the cultivar "${strainName}" for this specific grower.

${buildContext({ setup, stage: GrowStage.VEGETATIVE, climate, strain: null, schedule: null })}
${GROUND_RULES}

Rules for this profile:
- Report what is actually known about this cultivar. If it is obscure, a clone-only cut, or the name is ambiguous across breeders, set confidence to "Low" and say so in sourceNote rather than inventing specifics.
- THC/CBD figures vary by pheno and lab; give ranges, not single numbers.
- 'locationFit' is the important part: score 0-10 how well this cultivar suits ${setup.location ? `${setup.location.label} (latitude ${setup.location.latitude.toFixed(1)}, ${climate?.derived.season ?? 'current season'})` : 'their setup'} grown ${setup.environment.toLowerCase()}.
  - Reason about the real numbers above: season length before frost, overnight humidity versus this strain's mould resistance, heat tolerance versus forecast highs, and whether the flowering window finishes before the weather turns.
  - 'adjustments' are 2-4 concrete changes that make this cultivar work at THIS site.
  - 'outdoorPlantOutWindow' and 'outdoorHarvestWindow' must be actual calendar months for their hemisphere (${climate?.derived.hemisphere ?? 'unknown hemisphere'}). If they grow fully indoors, state that it does not apply.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            breeder: { type: Type.STRING },
            type: { type: Type.STRING, description: "e.g. Indica-dominant hybrid (70/30)" },
            lineage: { type: Type.STRING },
            photoperiodOrAuto: { type: Type.STRING, enum: ['Photoperiod', 'Autoflower', 'Unknown'] },
            thcRange: { type: Type.STRING },
            cbdRange: { type: Type.STRING },
            terpenes: { type: Type.ARRAY, items: { type: Type.STRING } },
            aromaFlavor: { type: Type.STRING },
            effects: { type: Type.ARRAY, items: { type: Type.STRING } },
            floweringDays: {
              type: Type.OBJECT,
              properties: { min: { type: Type.INTEGER }, max: { type: Type.INTEGER } },
              required: ['min', 'max']
            },
            seedToHarvestDays: {
              type: Type.OBJECT,
              description: "Autoflowers only; omit for photoperiods.",
              properties: { min: { type: Type.INTEGER }, max: { type: Type.INTEGER } },
              required: ['min', 'max']
            },
            stretchFactor: { type: Type.STRING, description: "e.g. 1.5-2x height after flip" },
            heightNote: { type: Type.STRING },
            yieldIndoor: { type: Type.STRING },
            yieldOutdoor: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] },
            feeding: {
              type: Type.OBJECT,
              properties: {
                ecRange: { type: Type.STRING },
                phRange: { type: Type.STRING },
                nitrogenAppetite: { type: Type.STRING },
                calMag: { type: Type.STRING },
                notes: { type: Type.STRING }
              },
              required: ['ecRange', 'phRange', 'nitrogenAppetite', 'calMag', 'notes']
            },
            climate: {
              type: Type.OBJECT,
              properties: {
                idealTempC: { type: Type.STRING },
                idealRhVeg: { type: Type.STRING },
                idealRhFlower: { type: Type.STRING },
                moldResistance: { type: Type.STRING },
                coldTolerance: { type: Type.STRING },
                heatTolerance: { type: Type.STRING }
              },
              required: ['idealTempC', 'idealRhVeg', 'idealRhFlower', 'moldResistance', 'coldTolerance', 'heatTolerance']
            },
            trainingTips: { type: Type.ARRAY, items: { type: Type.STRING } },
            commonIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
            harvestWindow: { type: Type.STRING, description: "Trichome guidance for the effect this strain is grown for." },
            locationFit: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER, description: "0-10 suitability at this exact location and environment" },
                verdict: { type: Type.STRING, description: "Short verdict, e.g. 'Strong fit' or 'Risky outdoors here'" },
                reasoning: { type: Type.STRING },
                adjustments: { type: Type.ARRAY, items: { type: Type.STRING } },
                outdoorPlantOutWindow: { type: Type.STRING },
                outdoorHarvestWindow: { type: Type.STRING }
              },
              required: ['score', 'verdict', 'reasoning', 'adjustments', 'outdoorPlantOutWindow', 'outdoorHarvestWindow']
            },
            confidence: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
            sourceNote: { type: Type.STRING, description: "How well established this cultivar's data is, and any ambiguity in the name." }
          },
          required: [
            'name', 'type', 'lineage', 'photoperiodOrAuto', 'thcRange', 'terpenes', 'floweringDays',
            'stretchFactor', 'yieldIndoor', 'yieldOutdoor', 'difficulty', 'feeding', 'climate',
            'trainingTips', 'commonIssues', 'harvestWindow', 'locationFit', 'confidence', 'sourceNote'
          ]
        }
      }
    });

    const parsed = JSON.parse(response.text || 'null');
    if (!parsed) return null;

    return { ...parsed, generatedAt: Date.now() } as StrainProfile;
  } catch (error) {
    console.error("Strain profile error:", error);
    return null;
  }
};

/** Short "what does today's weather mean for my plants" briefing. */
export const getLocalBriefing = async (
  setup: UserSetup,
  stage: GrowStage,
  climate: LocalClimate,
  strain: StrainProfile | null,
  schedule: GrowSchedule | null
): Promise<string> => {
  if (!apiKey) return "API Key missing.";

  const prompt = `
${buildContext({ setup, stage, climate, strain, schedule })}
${GROUND_RULES}

Write a 3-4 sentence briefing for this grower for today. Lead with the single most important thing their local conditions demand in the next 48 hours, then anything on the calendar they should prepare for. No greeting, no sign-off, no bullet points.
`;

  try {
    const response = await ai.models.generateContent({ model: MODEL, contents: prompt });
    return response.text || "No briefing available.";
  } catch (error) {
    console.error("Briefing error:", error);
    return "Could not generate a briefing right now.";
  }
};
