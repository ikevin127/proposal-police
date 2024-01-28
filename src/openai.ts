import OpenAI from "openai";
import * as CONFIG from './config';

const openai = new OpenAI({apiKey: CONFIG.OPENAI_API_KEY});
export default openai;
