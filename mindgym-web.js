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
const landing = document.getElementById('landing');      // ← новое
const chatContainer = document.getElementById('chatContainer'); // ← новое

// === Хранилище ===
const Storage = {
    set: (key, value) => localStorage.setItem(`mindgym_${key}`, value),
    get: (key) => localStorage.getItem(`mindgym_${key}`),
    remove: (key) => localStorage.removeItem(`mindgym_${key}`)
};

// === LLMClient (без изменений) ===
class LLMClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    async validateWithFeedback(exercise, userAnswer, signal) {
        const prompt = `Ты — добрый коуч по коммуникации.
Проанализируй ответ пользователя на ситуацию.

Ситуация: "${exercise.prompt}"
Эталонный ответ: "${exercise.expected_answer}"
Ответ пользователя: "${userAnswer}"

Оцени:
1. Соответствует ли ответ ключевым принципам эталона? (true/false)
2. Если нет — дай краткий (1–2 предложения), тёплый и конкретный фидбек: что хорошо, что можно улучшить.

Верни ТОЛЬКО валидный JSON:
{
  "isCorrect": true/false,
  "feedback": "строка или пусто"
}`;

        if (this.apiKey) {
            const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'qwen-turbo',
                    input: { messages: [{ role: 'user', content: prompt }] }
                }),
                signal
            });
            const data = await res.json();
            const raw = data.output?.choices?.[0]?.message?.content?.trim() || '{}';
            const clean = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            return JSON.parse(clean);
        } else {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen3:4b',
                    prompt: prompt,
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

// === Добавление сообщения в чат ===
function addMessage(role, text, messageId = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = `<div class="message-bubble">${text}</div>`;

    if (messageId) messageDiv.id = messageId;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv;
}

// === Показ упражнения с заголовком темы ===
function showExercise() {
    const exercise = core.getCurrentExercise();
    if (!exercise) return;

    const module = core.course.modules.find(m => m.id === core.currentModuleId);

    // Проверяем, есть ли уже заголовок для этого модуля
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
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addMessage('coach', exercise.prompt);
    sendBtn.disabled = false;
}

// === Обновление сообщения "думаю" ===
function updateThinkingMessage(timeLeft) {
    const el = document.getElementById('thinking');
    if (el) {
        el.innerHTML = `<span class="thinking">Думаю<span class="timer"> (${timeLeft}s)</span></span>`;
    }
}

// === Отправка сообщения ===
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
        const llm = new LLMClient(apiKey);

        const result = await Promise.race([
            llm.validateWithFeedback(exercise, text, abortController.signal),
            new Promise((_, reject) =>
                setTimeout(() => {
                    clearInterval(timerInterval);
                    reject(new Error('Таймаут'));
                }, 25000)
            )
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
                : exercise.feedback_on_error || 'Попробуйте признать заботу партнёра и предложить решение.';
            addMessage('coach', `💡 ${feedback}`);
            sendBtn.disabled = false;
        }
    } catch (error) {
        clearInterval(timerInterval);
        document.getElementById(thinkingMessageId)?.remove();

        if (error.name === 'AbortError') return;

        const fallback = exercise.feedback_on_error || 'Превышено время ожидания. Попробуйте ещё раз.';
        addMessage('coach', `💡 ${fallback}`);
        sendBtn.disabled = false;
    }
}

// === Загрузка курса ===
async function loadSelectedCourse() {
    const file = courseSelect.value;
    if (!file) return; // защита

    const res = await fetch(`courses/${file}`);
    const data = await res.json();
    core.loadCourse(data);
    courseTitle = data.metadata.title;

    // Скрываем лендинг, показываем чат
    landing.style.display = 'none';
    chatContainer.style.display = 'flex';

    chatMessages.innerHTML = '';
    showExercise();
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


// Параллакс от движения мыши
function initParallax() {
    const container = document.querySelector('.parallax-container');
    if (!container) return;

    const layers = {
        layer0: document.querySelector('.layer-0'),
        layer1: document.querySelector('.layer-1'),
        layer2: document.querySelector('.layer-2')
    };

    const depth = { layer0: 0.02, layer1: 0.04, layer2: 0.06 }; // глубина параллакса
    const sensitivity = 30; // чувствительность

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const moveX = (mouseX - centerX) / centerX;
        const moveY = (mouseY - centerY) / centerY;

        Object.keys(layers).forEach(layer => {
            if (layers[layer]) {
                const x = moveX * sensitivity * depth[layer];
                const y = moveY * sensitivity * depth[layer];
                layers[layer].style.transform = `translate(${x}px, ${y}px)`;
            }
        });
    });

    // Сброс при выходе мыши
    container.addEventListener('mouseleave', () => {
        Object.keys(layers).forEach(layer => {
            if (layers[layer]) {
                layers[layer].style.transform = 'translate(0, 0)';
            }
        });
    });
}

// Запуск параллакса
initParallax();

// Загрузка списка курсов (без автозапуска)
(async () => {
    const res = await fetch('courses/index.json');
    const courses = await res.json();

    courses.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.file;
        opt.textContent = course.title;
        courseSelect.appendChild(opt);
    });

    // НЕ запускаем курс автоматически — ждём выбора
    courseSelect.addEventListener('change', loadSelectedCourse);

    const savedKey = Storage.get('api_key');
    if (savedKey) apiKeyInput.value = savedKey.replace(/./g, '*');
})();