import { createDemoPlayer } from './demo-player.js';
import { createLLMProviderSelector } from './llm-provider-selector.js';

// === Глобальные переменные ===
const core = new MindGymCore();
let courseTitle = '';
let abortController = null;
let thinkingMessageId = null;
let currentChatLog = [];

// DOM
const courseSelect = document.getElementById('courseSelect');
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const resetBtn = document.getElementById('resetProgress');
const landing = document.getElementById('landing');
const chatContainer = document.getElementById('chatContainer');
const demoSection = document.getElementById('demoSection');

const LLM_PROVIDERS = {
    ollama: { defaultModel: 'qwen3:4b' },
    openrouter: { defaultModel: 'qwen/qwen3-8b:free' },
    openai: { defaultModel: 'gpt-4o-mini' },
    mistral: { defaultModel: 'mistral-small-latest' }
};

// === Хранилище ===
const Storage = {
    set: (key, value) => localStorage.setItem(`mindgym_${key}`, value),
    get: (key) => localStorage.getItem(`mindgym_${key}`),
    remove: (key) => localStorage.removeItem(`mindgym_${key}`)
};

// === LLMClient ===
class LLMClient {
    constructor(providerConfig, course) {
        this.config = providerConfig;
        this.course = course;
    }

    get isLocal() {
        return this.config.type === 'ollama';
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

        if (this.isLocal) {
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
        } else {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.key}`
            };
            let apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            let model = 'qwen/qwen3-8b:free';

            if (this.config.type === 'openai') {
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                model = 'gpt-4o-mini';
            } else if (this.config.type === 'mistral') {
                apiUrl = 'https://api.mistral.ai/v1/chat/completions';
                model = 'mistral-small-latest';
                headers['Authorization'] = `Bearer ${this.config.key}`;
            }
            // custom пока не поддерживаем — можно добавить позже

            if (this.config.type === 'openrouter') {
                headers['HTTP-Referer'] = window.location.origin;
                headers['X-Title'] = 'MindGym';
            }

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: fullPrompt + " . Ты обязан ответить ТОЛЬКО валидным JSON." }],
                    temperature: 0.3,
                    max_tokens: 1500
                }),
                signal
            });
            const data = await res.json();
            const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
            const clean = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            return JSON.parse(clean);
        }
    }
}

// === Рендеринг ===
function addMessageToDOM(role, text, thinking = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = `<div class="message-bubble">${text}</div>`;
    if (thinking) {
        messageDiv.setAttribute('data-thinking', 'true');
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderModuleHeader(moduleId) {
    const module = core.course.modules.find(m => m.id === moduleId);
    const headerDiv = document.createElement('div');
    headerDiv.className = 'module-header';
    headerDiv.setAttribute('data-module-id', moduleId);
    headerDiv.innerHTML = `
    <div class="module-divider"></div>
    <div class="module-title">${module.title}</div>
    <div class="module-description">${module.description}</div>
    <div class="module-divider"></div>
  `;
    chatMessages.appendChild(headerDiv);
}

function renderQuestion(prompt) {
    addMessageToDOM('coach', prompt);
}

// === Применение команды ===
function applyCommand(cmd) {
    switch (cmd.type) {
        case 'SHOW_MODULE_HEADER':
            if (!chatMessages.querySelector(`[data-module-id="${cmd.moduleId}"]`)) {
                renderModuleHeader(cmd.moduleId);
            }
            break;

        case 'SHOW_QUESTION':
            const exercise = core.course.exercises.find(e => e.id === cmd.exerciseId);
            if (exercise) {
                // 🔥 Синхронизируем состояние ядра
                core.currentModuleId = exercise.module_id;
                core.exerciseIndex = core.course.exercises
                    .filter(e => e.module_id === exercise.module_id)
                    .sort((a, b) => a.difficulty - b.difficulty)
                    .findIndex(e => e.id === exercise.id);

                renderQuestion(exercise.prompt);
            }
            break;;

        case 'ADD_MESSAGE':
            addMessageToDOM(cmd.role, cmd.text, cmd.thinking);
            if (cmd.thinking) {
                thinkingMessageId = 'thinking';
            }
            break;

        case 'HIDE_THINKING':
            const thinkingEl = chatMessages.querySelector('[data-thinking="true"]');
            if (thinkingEl) thinkingEl.remove();
            thinkingMessageId = null;
            break;

        case 'COMPLETE_COURSE':
            addMessageToDOM('coach', '🎉 Курс завершён! Выберите новый курс.');
            break;
    }
}

// === Сохранение и загрузка ===
function saveChatLog(courseId, version) {
    const key = JSON.stringify({ type: 'mindgym_log', courseId, version });
    localStorage.setItem(key, JSON.stringify(currentChatLog));
}

function loadChatLog(courseId, version) {
    const key = JSON.stringify({ type: 'mindgym_log', courseId, version });
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
}

function clearChatLog(courseId) {
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
        try {
            const parsed = JSON.parse(key);
            if (parsed.type === 'mindgym_log' && parsed.courseId === courseId) {
                localStorage.removeItem(key);
            }
        } catch (e) { /* ignore */ }
    });
}

// === Метатеги ===
function updateMetaTags(course = null) {
    const baseUrl = 'https://krivich.github.io/MindGym';
    let title, description, url;

    if (course) {
        title = `${course.metadata.title} — MindGym`;
        description = course.metadata.description || `Интерактивный курс по ${course.metadata.title.toLowerCase()}.`;
        const courseId = getCourseIdByFile(course.metadata._filename);
        url = `${baseUrl}/${courseId}`;
    } else {
        title = 'MindGym — Интерактивный тренажёр навыков';
        description = 'Развивайте эмоциональный интеллект, коммуникацию, электробезопасность и другие навыки через диалог с ИИ.';
        url = baseUrl;
    }

    document.title = title;
    document.querySelector('meta[name="description"]').setAttribute('content', description);
    document.querySelector('link[rel="canonical"]').setAttribute('href', url);
    document.querySelector('meta[property="og:title"]').setAttribute('content', title);
    document.querySelector('meta[property="og:description"]').setAttribute('content', description);
    document.querySelector('meta[property="og:url"]').setAttribute('content', url);
}

// === Загрузка курсов ===
let courseIndex = [];

function getCourseIdByFile(filename) {
    const entry = courseIndex.find(c => c.file === filename);
    return entry ? entry.id : 'unknown';
}

function getCourseFileFromUrl() {
    let courseId = window.location.hash.replace('#', '');
    if (!courseId) {
        const path = window.location.pathname;
        const parts = path.split('/');
        courseId = parts[parts.length - 1];
    }
    if (courseId && courseId !== 'MindGym' && courseId !== '') {
        const entry = courseIndex.find(c => c.id === courseId);
        return entry ? entry.file : null;
    }
    return null;
}

// === Отправка сообщения ===
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    currentChatLog.push({ type: 'ADD_MESSAGE', role: 'user', text });
    applyCommand(currentChatLog[currentChatLog.length - 1]);

    userInput.value = '';
    sendBtn.disabled = true;

    const exercise = core.getCurrentExercise();
    if (!exercise) {
        currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: 'Сначала выберите курс.' });
        applyCommand(currentChatLog[currentChatLog.length - 1]);
        sendBtn.disabled = false;
        return;
    }

    // Добавляем "Думаю" с маркером
    currentChatLog.push({
        type: 'ADD_MESSAGE',
        role: 'coach',
        text: '<span class="thinking">Думаю<span class="timer"> (25s)</span></span>',
        thinking: true
    });
    applyCommand(currentChatLog[currentChatLog.length - 1]);

    // Таймер
    let timeLeft = 25;
    const timerInterval = setInterval(() => {
        timeLeft--;
        const timerEl = chatMessages.querySelector('[data-thinking="true"] .timer');
        if (timerEl) {
            timerEl.textContent = ` (${timeLeft}s)`;
        }
        if (timeLeft <= 0) clearInterval(timerInterval);
    }, 1000);

    if (abortController) abortController.abort();
    abortController = new AbortController();

    try {
        const providerConfig = llmSelector.getConfig();
        const llm = new LLMClient(providerConfig, core.course);

        const result = await Promise.race([
            llm.validateWithFeedback(exercise, text, abortController.signal),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут')), 25000))
        ]);

        clearInterval(timerInterval);
        currentChatLog.push({ type: 'HIDE_THINKING' });
        applyCommand(currentChatLog[currentChatLog.length - 1]);

        if (result.isCorrect) {
            currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: '✅ Верно!' });
            applyCommand(currentChatLog[currentChatLog.length - 1]);

            currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: `📘 <strong>Как можно ответить:</strong><br>${exercise.expected_answer}` });
            applyCommand(currentChatLog[currentChatLog.length - 1]);

            if (core.hasNext()) {
                core.next();
                const nextExercise = core.getCurrentExercise();
                currentChatLog.push({ type: 'SHOW_QUESTION', exerciseId: nextExercise.id });
                applyCommand(currentChatLog[currentChatLog.length - 1]);
            } else if (core.hasNextModule()) {
                core.nextModule();
                const module = core.course.modules.find(m => m.id === core.currentModuleId);
                currentChatLog.push({ type: 'SHOW_MODULE_HEADER', moduleId: module.id });
                const nextExercise = core.getCurrentExercise();
                currentChatLog.push({ type: 'SHOW_QUESTION', exerciseId: nextExercise.id });
                applyCommand(currentChatLog[currentChatLog.length - 2]);
                applyCommand(currentChatLog[currentChatLog.length - 1]);
            } else {
                currentChatLog.push({ type: 'COMPLETE_COURSE' });
                applyCommand(currentChatLog[currentChatLog.length - 1]);
            }
        } else {
            const feedback = result.feedback?.trim()
                ? result.feedback
                : exercise.feedback_on_error || 'Попробуйте ещё раз.';
            currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: `💡 ${feedback}` });
            applyCommand(currentChatLog[currentChatLog.length - 1]);
            sendBtn.disabled = false;
        }

        const courseId = getCourseIdByFile(core.course.metadata._filename);
        saveChatLog(courseId, core.course.metadata.version);

    } catch (error) {
        clearInterval(timerInterval);
        currentChatLog.push({ type: 'HIDE_THINKING' });
        applyCommand(currentChatLog[currentChatLog.length - 1]);
        if (error.name !== 'AbortError') {
            const fallback = exercise.feedback_on_error || 'Превышено время ожидания.';
            currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: `💡 ${fallback}` });
            applyCommand(currentChatLog[currentChatLog.length - 1]);
            sendBtn.disabled = false;
        }
    }
}

// === Загрузка курса ===
async function loadSelectedCourse() {
    const file = courseSelect.value;
    if (!file) return;

    const res = await fetch(`courses/${file}`);
    const data = await res.json();
    core.loadCourse(data);
    courseTitle = data.metadata.title;
    data.metadata._filename = file;
    core.course = data;

    const courseId = getCourseIdByFile(file);
    const savedLog = loadChatLog(courseId, data.metadata.version);

    landing.style.display = 'none';
    demoSection.style.display = 'none'; // 👈 скрываем демо
    chatContainer.style.display = 'flex';
    chatMessages.innerHTML = '';

    // Показываем кнопку сброса
    document.getElementById('resetProgress').style.display = 'flex';

    if (savedLog) {
        currentChatLog = savedLog;
        currentChatLog.forEach(applyCommand);
    } else {
        currentChatLog = [];
        const firstModule = data.modules[0];
        const firstExercise = core.getCurrentExercise();

        currentChatLog.push({ type: 'SHOW_MODULE_HEADER', moduleId: firstModule.id });
        currentChatLog.push({ type: 'SHOW_QUESTION', exerciseId: firstExercise.id });

        currentChatLog.forEach(applyCommand);
    }

    updateMetaTags(core.course);
    sendBtn.disabled = false;
}

// === UI Handlers ===
courseSelect.addEventListener('change', async (e) => {
    if (e.target.value === '__upload__') {
        document.getElementById('courseFileInput').click();
        e.target.selectedIndex = 0;
        // Скрываем кнопку при загрузке файла
        document.getElementById('resetProgress').style.display = 'none';
    } else if (e.target.value) {
        // Показываем кнопку, если выбран курс
        document.getElementById('resetProgress').style.display = 'flex';
        await loadSelectedCourse();
    } else {
        // Скрываем, если ничего не выбрано
        document.getElementById('resetProgress').style.display = 'none';
    }
});

document.getElementById('courseFileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const courseData = JSON.parse(event.target.result);
            startCustomCourse(courseData);
        } catch (err) {
            alert('Ошибка: неверный формат JSON');
        }
    };
    reader.readAsText(file);
});

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length && files[0].name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const courseData = JSON.parse(event.target.result);
                startCustomCourse(courseData);
            } catch (err) {
                alert('Ошибка: неверный формат JSON');
            }
        };
        reader.readAsText(files[0]);
    }
});

function startCustomCourse(courseData) {
    if (!courseData.metadata?.title || !courseData.modules || !courseData.exercises) {
        alert('Неверный формат курса');
        return;
    }
    landing.style.display = 'none';
    chatContainer.style.display = 'flex';
    core.loadCourse(courseData);
    courseTitle = courseData.metadata.title;
    core.course = courseData;
    chatMessages.innerHTML = '';

    const firstModule = courseData.modules[0];
    const firstExercise = courseData.exercises.find(e => e.module_id === firstModule.id);

    currentChatLog = [
        { type: 'SHOW_MODULE_HEADER', moduleId: firstModule.id },
        { type: 'SHOW_QUESTION', exerciseId: firstExercise.id }
    ];
    currentChatLog.forEach(applyCommand);

    document.title = `${courseData.metadata.title} — MindGym`;
}

// В обработчике клика по логотипу (возврат на лендинг):
document.getElementById('appLogo').addEventListener('click', () => {
    chatContainer.style.display = 'none';
    landing.style.display = 'flex';
    demoSection.style.display = 'block'; // 👈 показываем демо
    chatMessages.innerHTML = '';
    courseSelect.selectedIndex = 0;
    updateMetaTags();
    document.getElementById('resetProgress').style.display = 'none';
});

document.getElementById('resetProgress').addEventListener('click', () => {
    if (!core.course) return;

    if (confirm('Сбросить прогресс курса?\nВся история будет удалена.')) {
        const courseId = getCourseIdByFile(core.course.metadata._filename);
        clearChatLog(courseId);

        const firstModule = core.course.modules[0];
        const firstExercise = core.getCurrentExercise();
        chatMessages.innerHTML = '';
        currentChatLog = [
            { type: 'SHOW_MODULE_HEADER', moduleId: firstModule.id },
            { type: 'SHOW_QUESTION', exerciseId: firstExercise.id }
        ];
        currentChatLog.forEach(applyCommand);
    }
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

const UNIVERSAL_DEMO_LOG = {
    module: {
        title: "Ответ на критику",
        description: "Как реагировать без защиты и вины"
    },
    steps: [
        { role: 'coach', text: 'Партнёр говорит: «Ты вообще не слушаешь, что я говорю!»' },
        { role: 'user', text: 'Ну да, я же не робот!' },
        { role: 'coach', text: '💡 Это защита. Попробуйте: «Слышу твою обиду...»' },
        { role: 'user', text: 'Слышу твою обиду. Прости, что создаю такое впечатление...' },
        { role: 'coach', text: '✅ Верно!' }
    ]
};

// Инициализация демо после загрузки страницы
let llmSelector;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('demoSection')) {
        createDemoPlayer('demoSection', UNIVERSAL_DEMO_LOG, {
            typingDuration: 3000,
            messageDelay: 1800
        });
    }
    llmSelector = createLLMProviderSelector('llmProviderContainer');
});

// === Инициализация ===
(async () => {
    const res = await fetch('courses/index.json');
    courseIndex = await res.json();

    courseIndex.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.file;
        opt.textContent = course.title;
        courseSelect.appendChild(opt);
    });

    const uploadOption = document.createElement('option');
    uploadOption.value = '__upload__';
    uploadOption.textContent = '📁 Загрузить из файла…';
    courseSelect.appendChild(uploadOption);

    const courseFileFromUrl = getCourseFileFromUrl();
    if (courseFileFromUrl) {
        courseSelect.value = courseFileFromUrl;
        await loadSelectedCourse();
        history.replaceState(null, '', window.location.pathname);
    } else {
        updateMetaTags();
    }
})();