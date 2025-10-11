import { createDemoPlayer } from './demo-player.js';
import { createLLMProviderSelector } from './llm-provider-selector.js';
import { CourseEditor } from './course-editor.js';
import { createCourseActionsSelector } from './course-actions-selector.js';

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
    // === Приватный метод: общий вызов LLM по messages ===
    async _callLLM(messages, signal, max_tokens=2000) {
        if (this.isLocal) {
            // Для Ollama: формируем промпт из messages
            let prompt = '';
            for (const msg of messages) {
                if (msg.role === 'system') prompt += msg.content + '\n\n';
                if (msg.role === 'user') prompt += msg.content;
            }
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen3:4b',
                    prompt,
                    stream: false
                }),
                signal
            });
            const data = await res.json();
            return data.response;
        } else {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.key}`
            };
            let apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            let model = this.config.model || 'qwen/qwen3-8b:free';

            if (this.config.type === 'openai') {
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                model = this.config.model || 'gpt-4o-mini';
            } else if (this.config.type === 'mistral') {
                apiUrl = 'https://api.mistral.ai/v1/chat/completions';
                model = this.config.model || 'mistral-small-latest';
                headers['Authorization'] = `Bearer ${this.config.key}`;
            }

            if (this.config.type === 'openrouter') {
                headers['HTTP-Referer'] = window.location.origin;
                headers['X-Title'] = 'MindGym';
            }

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: max_tokens }),
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

        const messages = [
            { role: 'user', content: fullPrompt + " . Ты обязан ответить ТОЛЬКО валидным JSON." }
        ];

        const raw = await this._callLLM(messages, signal);
        const clean = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        return JSON.parse(clean);
    }
    // === Генерация курса через ИИ ===
    async generateCourse(userPrompt, systemInstructions, signal) {
        const messages = [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: `Создай курс на основе описания:\n"${userPrompt}"` }
        ];
        return await this._callLLM(messages, signal, 10000);
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
                core.currentModuleId = exercise.module_id;
                core.exerciseIndex = core.course.exercises
                    .filter(e => e.module_id === exercise.module_id)
                    .sort((a, b) => a.difficulty - b.difficulty)
                    .findIndex(e => e.id === exercise.id);
                renderQuestion(exercise.prompt);
            }
            break;
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

// === Вспомогательные функции ===
let courseIndex = [];

function getCourseIdByFile(filename) {
    const entry = courseIndex.find(c => c.file === filename);
    return entry ? entry.id : 'unknown';
}

function getCourseIdForProgress(course) {
    // Для локальных курсов используем _localId
    return course._localId || getCourseIdByFile(course.metadata._filename);
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

// === Общая инициализация сессии ===
function startCourseSession(courseData, courseId, isLocal = false) {
    if (!courseData.metadata?.title?.trim() || !courseData.modules || !courseData.exercises) {
        alert('Неверный формат курса: проверьте обязательные поля.');
        return;
    }


    // ✅ Включаем режим чата
    document.body.classList.add('chat-mode');

    // Скрываем лендинг и демо (они всё равно скрыты через CSS, но можно и явно)
    landing.style.display = 'none';
    demoSection.style.display = 'none';

    // Показываем чат
    document.getElementById('chatWrapper').style.display = 'flex';
    chatMessages.innerHTML = '';

    core.loadCourse(courseData);
    courseTitle = courseData.metadata.title;
    core.course = isLocal ? { ...courseData, _localId: courseId } : courseData;

    const savedLog = loadChatLog(courseId, courseData.metadata.version);
    if (savedLog) {
        currentChatLog = savedLog;
        currentChatLog.forEach(applyCommand);
    } else {
        const firstModule = courseData.modules[0];
        const firstExercise = courseData.exercises.find(e => e.module_id === firstModule.id);
        currentChatLog = [
            { type: 'SHOW_MODULE_HEADER', moduleId: firstModule.id },
            { type: 'SHOW_QUESTION', exerciseId: firstExercise.id }
        ];
        currentChatLog.forEach(applyCommand);
    }

    document.title = `${courseData.metadata.title} — MindGym`;
    updateMetaTags(core.course);
    sendBtn.disabled = false;
}

// === Загрузка официального курса ===
async function loadSelectedCourse() {
    const file = courseSelect.value;
    if (!file) return;
    const res = await fetch(`courses/${file}`);
    const data = await res.json();
    data.metadata._filename = file;
    const courseId = getCourseIdByFile(file);
    startCourseSession(data, courseId, false);
}

// === Запуск пользовательского курса ===
function startCustomCourse(courseData, localCourseId = null) {
    // Для курсов из файла (не из редактора) генерируем временный ID на сессию
    const courseId = localCourseId || 'file_' + Date.now().toString(36);
    startCourseSession(courseData, courseId, true);
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

    currentChatLog.push({
        type: 'ADD_MESSAGE',
        role: 'coach',
        text: '<span class="thinking">Думаю<span class="timer"> (25s)</span></span>',
        thinking: true
    });
    applyCommand(currentChatLog[currentChatLog.length - 1]);

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

        const courseId = getCourseIdForProgress(core.course);
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

// === UI Handlers ===
courseSelect.addEventListener('change', async (e) => {

    if (courseEditor?.container.style.display !== 'none') {
        courseEditor.hide();
    }
    const value = e.target.value;
    if (value === '__create__') {
        courseEditor.show();
        document.body.classList.remove('chat-mode');
        landing.style.display = 'none';
        chatContainer.style.display = 'none';
        demoSection.style.display = 'none';
        e.target.selectedIndex = 0;
        courseActionsSelector?.setCourse(null);
        return;
    }
    if (value.startsWith('__local__')) {
        const id = value.replace('__local__', '');
        const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
        const course = localCourses.find(c => c.id === id);
        if (course) {
            startCustomCourse(course.data, id);
            courseActionsSelector?.setCourse('local', id);
        }
        demoSection.style.display = 'none';
        e.target.selectedIndex = 0;
        return;
    }
    if (value === '__upload__') {
        document.getElementById('courseFileInput').click();
        e.target.selectedIndex = 0;
        courseActionsSelector?.setCourse(null);
        return;
    }
    if (value) {
        await loadSelectedCourse();
        courseActionsSelector?.setCourse('official');
        return;
    }
    courseActionsSelector?.setCourse(null);
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
        if (courseEditor && courseEditor.container.style.display !== 'none') {
            courseEditor.loadFromFile(files[0]);
            return;
        }
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

// === Обработчики действий ===
async function handleResetProgress() {
    if (!core.course) return;
    if (confirm('Сбросить прогресс курса?\nВся история будет удалена.')) {
        const courseId = getCourseIdForProgress(core.course);
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
}

async function handleShare() {
    const url = window.location.href;
    try {
        if (navigator.share) {
            await navigator.share({ title: document.title, url });
        } else {
            await navigator.clipboard.writeText(url);
            alert('Ссылка скопирована!');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            alert('Не удалось поделиться. Скопируйте ссылку вручную.');
        }
    }
}

// === Инициализация ===
let llmSelector;
let courseEditor;
let courseActionsSelector;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('demoSection')) {
        createDemoPlayer('demoSection', UNIVERSAL_DEMO_LOG, {
            typingDuration: 3000,
            messageDelay: 1800
        });
    }
    llmSelector = createLLMProviderSelector('llmProviderContainer');
    window.createLLMClient = (course) => {
        const config = llmSelector.getConfig();
        return new LLMClient(config, course);
    };
    courseEditor = new CourseEditor('courseEditorContainer');
    courseEditor.setOnLaunch((courseData, editingId) => {
        courseEditor.hide();
        const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
        let newId = editingId;
        if (editingId) {
            const idx = localCourses.findIndex(c => c.id === editingId);
            if (idx !== -1) {
                localCourses[idx] = { id: editingId, title: courseData.metadata.title, data: courseData };
                localStorage.setItem('mindgym_local_courses', JSON.stringify(localCourses));
                const opt = Array.from(courseSelect.options).find(o => o.value === `__local__${editingId}`);
                if (opt) opt.textContent = `💾 ${courseData.metadata.title}`;
            }
        } else {
            newId = Date.now().toString();
            localCourses.push({ id: newId, title: courseData.metadata.title, data: courseData });
            localStorage.setItem('mindgym_local_courses', JSON.stringify(localCourses));
            const opt = document.createElement('option');
            opt.value = `__local__${newId}`;
            opt.textContent = `💾 ${courseData.metadata.title}`;
            courseSelect.appendChild(opt);
        }
        startCustomCourse(courseData, newId);
    });

    courseActionsSelector = createCourseActionsSelector('courseMenuBtn');
    courseActionsSelector.setOnAction(async (action, courseId) => {
        if (action === 'reset') {
            await handleResetProgress();
        } else if (action === 'share') {
            await handleShare();
        } else if (action === 'edit') {
            const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
            const course = localCourses.find(c => c.id === courseId);
            if (course) {
                courseEditor.show();
                document.body.classList.remove('chat-mode');
                courseEditor.loadCourseData(course.data, courseId);
                chatContainer.style.display = 'none';
                landing.style.display = 'none';
            }
        } else if (action === 'delete') {
            if (confirm('Удалить курс навсегда?')) {
                let localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
                localCourses = localCourses.filter(c => c.id !== courseId);
                localStorage.setItem('mindgym_local_courses', JSON.stringify(localCourses));
                location.reload();
            }
        }
    });
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

document.getElementById('appLogo').addEventListener('click', () => {
    document.body.classList.remove('chat-mode');
    landing.style.display = 'flex';
    demoSection.style.display = 'block';
    document.getElementById('chatWrapper').style.display = 'none';
    chatMessages.innerHTML = '';
    courseSelect.selectedIndex = 0;
    updateMetaTags();
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

// === Загрузка индекса курсов ===
(async () => {
    const res = await fetch('courses/index.json');
    courseIndex = await res.json();
    courseIndex.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.file;
        opt.textContent = course.title;
        courseSelect.appendChild(opt);
    });

    const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
    localCourses.forEach(course => {
        const opt = document.createElement('option');
        opt.value = `__local__${course.id}`;
        opt.textContent = `💾 ${course.title}`;
        courseSelect.appendChild(opt);
    });

    const uploadOption = document.createElement('option');
    uploadOption.value = '__upload__';
    uploadOption.textContent = '📁 Загрузить из файла…';
    courseSelect.appendChild(uploadOption);

    const createOption = document.createElement('option');
    createOption.value = '__create__';
    createOption.textContent = '✨ Создать курс с ИИ';
    courseSelect.appendChild(createOption);

    const courseFileFromUrl = getCourseFileFromUrl();
    if (courseFileFromUrl) {
        courseSelect.value = courseFileFromUrl;
        await loadSelectedCourse();
        history.replaceState(null, '', window.location.pathname);
    } else {
        updateMetaTags();
    }
})();