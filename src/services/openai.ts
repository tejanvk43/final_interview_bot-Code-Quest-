import OpenAI from 'openai';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
export const isGroq = apiKey.startsWith('gsk_');

export const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: 0
});

export const AI_MODEL = isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
