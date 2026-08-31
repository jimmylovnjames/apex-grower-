import { GoogleGenAI, Type } from "@google/genai";
import { GrowStage, UserSetup, Task, DiagnosisResult } from "../types";

const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

export const generateTasksForStage = async (
  stage: GrowStage,
  setup: UserSetup,
  existingTasks: Task[]
): Promise<Task[]> => {
  if (!apiKey) return [];

  const prompt = `
    You are an elite master cannabis cultivator assisting a grower.
    
    User Setup:
    - Method: ${setup.method}
    - Environment: ${setup.environment}
    - Strain Type: ${setup.strainType}
    - Experience: ${setup.experienceLevel}
    
    Current Stage: ${stage}

    Generate 5 specific, high-impact, actionable tasks for this specific stage and setup. 
    The tasks should help the user level up their skills.
    Avoid generic advice if possible; be specific to the medium (e.g., pH levels for specific medium).
    
    Do not duplicate these existing tasks: ${existingTasks.map(t => t.title).join(', ')}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short, punchy title of the task" },
              description: { type: Type.STRING, description: "1-2 sentences explaining exactly what to do and why." },
              category: { type: Type.STRING, enum: ['Environment', 'Feeding', 'Training', 'Observation'] }
            },
            required: ['title', 'description', 'category']
          }
        }
      }
    });

    const data = JSON.parse(response.text || '[]');
    
    return data.map((item: any) => ({
      id: Math.random().toString(36).substr(2, 9),
      title: item.title,
      description: item.description,
      completed: false,
      category: item.category
    }));

  } catch (error) {
    console.error("Failed to generate tasks:", error);
    return [];
  }
};

export const chatWithGrower = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  setup: UserSetup,
  stage: GrowStage
): Promise<string> => {
    if (!apiKey) return "API Key missing.";

    const systemInstruction = `
      You are Apex, a no-nonsense, highly skilled cannabis cultivation expert.
      Your goal is to help the user grow top-shelf cannabis.
      
      Context:
      - Stage: ${stage}
      - Setup: ${setup.method}, ${setup.environment}, ${setup.strainType}
      
      Keep answers concise, actionable, and scientifically accurate. 
      If the user is doing something risky, warn them directly.
      Use metric and imperial measurements where relevant.
    `;

    try {
        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
            },
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
  symptom: string
): Promise<DiagnosisResult | null> => {
  if (!apiKey) return null;

  const prompt = `
    You are an expert cannabis plant pathologist.
    
    Context:
    - User Method: ${setup.method}
    - Environment: ${setup.environment}
    - Stage: ${stage}
    
    Problem Category: ${category}
    Specific Symptom: ${symptom}

    Analyze the likely cause based on the method and stage. For example, if method is Coco and leaves are yellowing, check for CalMag or pH drift first.

    Provide a JSON response with:
    1. 'issue': The name of the diagnosed problem (e.g. "Nitrogen Deficiency", "Broad Mites", "Light Stress").
    2. 'analysis': A concise explanation of why this is happening.
    3. 'actions': An array of 3 specific, step-by-step instructions to fix it immediately.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            issue: { type: Type.STRING },
            analysis: { type: Type.STRING },
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
