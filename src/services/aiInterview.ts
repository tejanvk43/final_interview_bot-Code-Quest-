import { openai, AI_MODEL, isGroq } from './openai';

// --- ROBUST RATE LIMITER & QUEUE ---

class RequestQueue {
    // Stores the Task Function and the Resolve/Reject handlers
    private queue: {
        task: () => Promise<any>,
        resolve: (val: any) => void,
        reject: (err: any) => void,
        retries: number
    }[] = [];
    private isProcessing = false;
    private lastCallTime = 0;
    // 3 RPM = 1 request every 20 seconds. 
    // Strict limit enforced by your current OpenAI tier.
    private readonly COOLDOWN_MS = isGroq ? 1000 : 22000;
    private readonly STORAGE_KEY = 'openai_last_call_time';

    constructor() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            this.lastCallTime = parseInt(stored, 10);
        }
    }

    async add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject, retries: 0 });
            this.process();
        });
    }

    private async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const item = this.queue[0]; // Peek

        if (item) {
            // Sync with local storage
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const storedTime = parseInt(stored, 10);
                if (!isNaN(storedTime) && storedTime > this.lastCallTime) {
                    this.lastCallTime = storedTime;
                }
            }

            const now = Date.now();
            const timeSinceLast = now - this.lastCallTime;
            const waitTime = Math.max(0, this.COOLDOWN_MS - timeSinceLast);

            if (waitTime > 0) {
                console.log(`[AI Queue] Cooling down for ${waitTime}ms...`);
                await new Promise(r => setTimeout(r, waitTime));
            }

            try {
                const result = await item.task();
                this.queue.shift(); // Remove on success
                item.resolve(result);

                // Update time only on success (or fatal error)
                this.lastCallTime = Date.now();
                localStorage.setItem(this.STORAGE_KEY, this.lastCallTime.toString());

            } catch (err: any) {
                // Should we retry?
                const isRateLimit = err?.status === 429 || err?.message?.includes('429');

                if (isRateLimit && item.retries < 1) {
                    console.warn("[AI Queue] Hit 429. Backing off for 22s before retrying...");
                    item.retries++;
                    // We DO NOT shift the item. We keep it at [0].
                    // We update lastCallTime to "now" so the NEXT loop waits 22s.
                    this.lastCallTime = Date.now();
                    localStorage.setItem(this.STORAGE_KEY, this.lastCallTime.toString());
                } else {
                    // Fatal or max retries exceeded
                    console.error("[AI Queue] Task failed permanently:", err);
                    this.queue.shift();
                    item.reject(err);

                    this.lastCallTime = Date.now();
                    localStorage.setItem(this.STORAGE_KEY, this.lastCallTime.toString());
                }
            } finally {
                this.isProcessing = false;
                this.process();
            }
        }
    }
}

export const aiQueue = new RequestQueue();

// Wrapper
const apiCallWrapper = async <T>(apiName: string, fn: () => Promise<T>): Promise<T> => {
    return aiQueue.add(async () => {
        console.log(`[AI Service] Starting: ${apiName}`);
        try {
            const result = await fn();
            return result;
        } catch (error: any) {
            if (error?.status === 429) {
                console.error(`[AI Service] 429 Too Many Requests in ${apiName}`);
                console.error("[AI Service] 429 Details:", error); // Log full error object
                throw new Error("AI_RATE_LIMIT_EXCEEDED");
            }
            throw error;
        }
    });
};

// --- CORE FUNCTIONS ---

export const initializeInterviewSession = async (professionalSummary: string, skills: string) => {
    return apiCallWrapper("InitSession", async () => {
        const prompt = `
        Candidate Profile:
        - Summary: ${professionalSummary}
        - Skills: ${skills}

        Generate the FIRST interview question.
        IMPORTANT: The candidate is a beginner. Keep the question VERY BASIC and SIMPLE. 
        Focus on fundamental concepts only.
        
        Output format: JSON object with keys: 
        - firstQuestion (object with keys: questionText (string), topic (string), difficulty (string))
        `;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: "system", content: "You are a friendly interviewer for freshers. Ask easy, entry-level questions. Respond ONLY with valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content received from OpenAI");
        return JSON.parse(content);
    });
};

export const generateQuestion = async (resumeSummary: string, recentTopics: string[], prevA: string, questionNumber: number = 2) => {
    return apiCallWrapper("GenerateQuestion", async () => {
        const isCodingRound = questionNumber >= 6;
        const topicsStr = recentTopics.join(", ");

        let prompt = "";
        let systemMsg = "";

        if (isCodingRound) {
            prompt = `
            Resume Summary: ${resumeSummary}
            Previously Covered: ${topicsStr}
            Previous Answer Context: ${prevA}
            
            Generate a CODING CHALLENGE.
            
            Task:
            1. Create a simple algorithmic problem. 
            2. It MUST be different from previous topics (${topicsStr}).
            3. Provide Problem Statement and Example I/O.
            
            Output format: JSON object with keys: 
            - questionText (string), 
            - topic (string), 
            - difficulty (string)
            `;
            systemMsg = "You are a coding interview platform.";
        } else {
            prompt = `
            Resume Summary: ${resumeSummary}
            Topics already asked: [${topicsStr}]
            Last Answer Given: "${prevA}"
            
            Generate the NEXT interview question.
            
            RULES:
            1. NO REPETITION. Do not ask about [${topicsStr}] again. Pick a completely new topic.
            2. ADAPTIVE DIFFICULTY:
               - Read the "Last Answer Given". 
               - If it is correct and detailed -> Make the next question "Intermediate" (increase depth).
               - If it is vague, short, or wrong -> Keep the next question "Basic/Easy".
            3. Keep the tone friendly but professional.

            Output format: JSON object with keys: questionText, topic, difficulty (easy|medium).
            `;
            systemMsg = "You are an adaptive technical interviewer. Ensure variety and adjust difficulty based on candidate performance. Respond ONLY with valid JSON.";
        }

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content received from OpenAI");
        return JSON.parse(content);
    });
};

export const evaluateAnswer = async (question: string, answer: string) => {
    return apiCallWrapper("EvaluateAnswer", async () => {
        const prompt = `
        Question: ${question}
        Answer: ${answer}
        
        Evaluate the answer.
        Output format: JSON object with keys: technicalScore (number), clarityScore (number), confidenceScore (number), feedback (string).
        `;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: "system", content: "You are an evaluator. Respond ONLY with valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content received from OpenAI");
        return JSON.parse(content);
    });
};

export const calculateFinalScore = async (interviewTranscript: string) => {
    return apiCallWrapper("FinalScore", async () => {
        const prompt = `
        Data: ${interviewTranscript}
        
        Compute final score (0-100) and provide justification.
        Output format: JSON object with keys: finalScore (number), justification (string).
        `;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: "system", content: "You are a hiring panel. Respond ONLY with valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content received from OpenAI");
        return JSON.parse(content);
    });
};

// Deprecated wrapper removed or updated if needed elsewhere
export const analyzeResume = async (_input: any) => {
    return initializeInterviewSession("Legacy User", "General");
};
