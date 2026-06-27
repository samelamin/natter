import OpenAI from 'openai';
let _c;
export function getLLM(){ if(!_c) _c=new OpenAI({apiKey:process.env.MINIMAX_API_KEY, baseURL:process.env.MINIMAX_BASE_URL||'https://api.minimax.io/v1'}); return _c; }
export const LLM_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2';