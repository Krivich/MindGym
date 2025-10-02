// === Глобальные переменные ===
const core = new MindGymCore();
let courseTitle = '';
let abortController = null;
let thinkingMessageId = null;

// DOM
const apiKeyInput = document.getElementById('apiKey');
const clearKeyBtn = document.getElementById('clearKey');
const courseSelect = document.getElementById('courseSelect');
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const landing = document.getElementById('landing');
const chatContainer = document.getElementById('chatContainer');

// === Хранилище ===
const Storage = {
    set: (key, value) => localStorage.setItem(`mindgym_${key}`, value),
    get: (key) => localStorage.getItem(`mindgym_${key}`),
    remove: (key) => localStorage.removeItem(`mindgym_${key}`)
};

// === LLMClient ===
class LLMClient {
    constructor(apiKey, course) {
        this.apiKey = apiKey;
        this.course = course;
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

        if (this.apiKey) {
            // === OpenRouter (облако) ===
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'MindGym'
                },
                body: JSON.stringify({
                    model: 'qwen/qwen3-8b:free',
                    messages: [{ role: 'user', content: fullPrompt }],
                    temperature: 0.3,
                    max_tokens: 500
                }),
                signal
            });
            const data = await res.json();
            const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
            const clean = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            return JSON.parse(clean);
        } else {
            // === Ollama (локально) ===
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen3:4b',
                    prompt: fullPrompt,
                    format: 'json',
                    stream: false
                }),
                signal
            });
            const data = await res.json();
            return JSON.parse(data.response);
        }
    }
}

// === Чат-функции ===
function addMessage(role, text, messageId = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = `<div class="message-bubble">${text}</div>`;
    if (messageId) messageDiv.id = messageId;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showExercise() {
    const exercise = core.getCurrentExercise();
    if (!exercise) return;

    const module = core.course.modules.find(m => m.id === core.currentModuleId);
    const headerExists = chatMessages.querySelector(`[data-module-id="${module.id}"]`);
    if (!headerExists) {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'module-header';
        headerDiv.setAttribute('data-module-id', module.id);
        headerDiv.innerHTML = `
      <div class="module-divider"></div>
      <div class="module-title">${module.title}</div>
      <div class="module-description">${module.description}</div>
      <div class="module-divider"></div>
    `;
        chatMessages.appendChild(headerDiv);
    }
    addMessage('coach', exercise.prompt);
    sendBtn.disabled = false;
}

function updateThinkingMessage(timeLeft) {
    const el = document.getElementById('thinking');
    if (el) {
        el.innerHTML = `<span class="thinking">Думаю<span class="timer"> (${timeLeft}s)</span></span>`;
    }
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage('user', text);
    userInput.value = '';
    sendBtn.disabled = true;

    const exercise = core.getCurrentExercise();
    if (!exercise) {
        addMessage('coach', 'Сначала выберите курс.');
        sendBtn.disabled = false;
        return;
    }

    thinkingMessageId = 'thinking';
    addMessage('coach', '<span class="thinking">Думаю<span class="timer"> (25s)</span></span>', thinkingMessageId);

    let timeLeft = 25;
    const timerInterval = setInterval(() => {
        timeLeft--;
        updateThinkingMessage(timeLeft);
        if (timeLeft <= 0) clearInterval(timerInterval);
    }, 1000);

    if (abortController) abortController.abort();
    abortController = new AbortController();

    try {
        const apiKey = Storage.get('api_key');
        const llm = new LLMClient(apiKey, core.course);

        const result = await Promise.race([
            llm.validateWithFeedback(exercise, text, abortController.signal),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут')), 25000))
        ]);

        clearInterval(timerInterval);
        document.getElementById(thinkingMessageId)?.remove();

        if (result.isCorrect) {
            addMessage('coach', '✅ Верно!');
            if (core.hasNext()) {
                core.next();
                setTimeout(showExercise, 800);
            } else {
                addMessage('coach', '🎉 Курс завершён! Выберите новый курс.');
            }
        } else {
            const feedback = result.feedback?.trim()
                ? result.feedback
                : exercise.feedback_on_error || 'Попробуйте ещё раз.';
            addMessage('coach', `💡 ${feedback}`);
            sendBtn.disabled = false;
        }
    } catch (error) {
        clearInterval(timerInterval);
        document.getElementById(thinkingMessageId)?.remove();
        if (error.name !== 'AbortError') {
            const fallback = exercise.feedback_on_error || 'Превышено время ожидания.';
            addMessage('coach', `💡 ${fallback}`);
            sendBtn.disabled = false;
        }
    }
}

async function loadSelectedCourse() {
    const file = courseSelect.value;
    if (!file) return;

    const res = await fetch(`courses/${file}`);
    const data = await res.json();
    core.loadCourse(data);
    courseTitle = data.metadata.title;

    landing.style.display = 'none';
    chatContainer.style.display = 'flex';
    chatMessages.innerHTML = '';
    showExercise();
}

// === Параллакс ===
function initParallax() {
    const container = document.querySelector('.parallax-container');
    if (!container) return;

    const layers = {
        layer0: document.querySelector('.layer-0'),
        layer1: document.querySelector('.layer-1'),
        layer2: document.querySelector('.layer-2')
    };
    const depth = { layer0: 0.02, layer1: 0.04, layer2: 0.06 };
    const sensitivity = 30;

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const moveX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        const moveY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);

        Object.keys(layers).forEach(key => {
            if (layers[key]) {
                const x = moveX * sensitivity * depth[key];
                const y = moveY * sensitivity * depth[key];
                layers[key].style.transform = `translate(${x}px, ${y}px)`;
            }
        });
    });

    container.addEventListener('mouseleave', () => {
        Object.values(layers).forEach(el => {
            if (el) el.style.transform = 'translate(0, 0)';
        });
    });
}

// === Инициализация ===
apiKeyInput.addEventListener('input', () => {
    const val = apiKeyInput.value;
    if (val && !val.includes('*')) {
        Storage.set('api_key', val);
    }
});

clearKeyBtn.addEventListener('click', () => {
    Storage.remove('api_key');
    apiKeyInput.value = '';
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('input', () => {
    sendBtn.disabled = userInput.value.trim() === '';
});
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage();
    }
});

initParallax();

(async () => {
    const res = await fetch('courses/index.json');
    const courses = await res.json();
    courses.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.file;
        opt.textContent = course.title;
        courseSelect.appendChild(opt);
    });
    courseSelect.addEventListener('change', loadSelectedCourse);

    const savedKey = Storage.get('api_key');
    if (savedKey) apiKeyInput.value = savedKey.replace(/./g, '*');
})();