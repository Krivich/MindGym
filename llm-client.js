export class LLMClient {
    constructor(providerConfig, course) {
        this.config = providerConfig;
        this.course = course;
    }

    get isLocal() {
        return this.config.type === 'ollama';
    }

    async _callLLM(messages, signal, max_tokens = 2000) {
        if (this.isLocal) {
            let prompt = '';
            for (const msg of messages) {
                if (msg.role === 'system') prompt += msg.content + '\n';
                if (msg.role === 'user') prompt += msg.content;
            }
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'qwen3:4b', prompt, stream: false }),
                signal
            });
            const data = await res.json();
            return data.response;
        } else {
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.key}` };
            let apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            let model = this.config.model || 'qwen/qwen3-8b:free';

            if (this.config.type === 'openai') {
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                model = this.config.model || 'gpt-4o-mini';
            } else if (this.config.type === 'mistral') {
                apiUrl = 'https://api.mistral.ai/v1/chat/completions';
                model = this.config.model || 'mistral-small-latest';
            }

            if (this.config.type === 'openrouter') {
                headers['HTTP-Referer'] = window.location.origin;
                headers['X-Title'] = 'MindGym';
            }

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens }),
                signal
            });
            const data = await res.json();
            return data.choices?.[0]?.message?.content?.trim() || '';
        }
    }

    async validateWithFeedback(exercise, userAnswer, signal) {
        const validationPrompt = this.course.metadata.validation_prompt ||
            "Ты — эксперт по теме курса. Оцени ответ пользователя по эталону.";
        const fullPrompt = `${validationPrompt}
Ситуация: "${exercise.prompt}"
Эталонный ответ: "${exercise.expected_answer}"
Ответ пользователя: "${userAnswer}"
Верни ТОЛЬКО валидный JSON:
{
  "isCorrect": true/false,
  "feedback": "строка или пусто"
}`;
        const messages = [{ role: 'user', content: fullPrompt + " . Ты обязан ответить ТОЛЬКО валидным JSON." }];
        const raw = await this._callLLM(messages, signal);
        const clean = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        return JSON.parse(clean);
    }

    async generateCourse(userPrompt, systemInstructions, signal) {
        const messages = [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: `Создай курс на основе описания:\n"${userPrompt}"` }
        ];
        return await this._callLLM(messages, signal, 10000);
    }
}