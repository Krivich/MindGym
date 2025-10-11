// dialog.js
import { MindGymCore } from './mindgym-core.js';

export class Dialog {
    constructor({
                    chatMessagesEl,
                    userInputEl,
                    sendBtnEl,
                    chatWrapperEl,
                    abortController = null
                }) {
        this.chatMessages = chatMessagesEl;
        this.userInput = userInputEl;
        this.sendBtn = sendBtnEl;
        this.chatWrapper = chatWrapperEl;
        this.abortController = abortController;

        this.core = new MindGymCore();
        this.currentChatLog = [];
        this.course = null;
        this.courseId = null;
        this.isLocal = false;

        this.onComplete = null;
        this.onExit = null;

        this.init();
    }

    init() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.userInput.addEventListener('input', () => {
            this.sendBtn.disabled = this.userInput.value.trim() === '';
        });
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.sendBtn.disabled) this.sendMessage();
            }
        });
    }

    // === Публичный API ===

    start(courseData, courseId, isLocal = false, savedLog = null) {
        this.course = courseData;
        this.courseId = courseId;
        this.isLocal = isLocal;

        this.core.loadCourse(courseData);
        this.currentChatLog = savedLog || this._buildInitialLog();

        this._clearChat();
        this._replayLog();

        document.body.classList.add('chat-mode');
        this.chatWrapper.style.display = 'flex';
        document.title = `${courseData.metadata.title} — MindGym`;
    }

    reset() {
        const firstModule = this.course.modules[0];
        const firstExercise = this.core.getCurrentExercise();
        this._clearChat();
        this.currentChatLog = [
            { type: 'SHOW_MODULE_HEADER', moduleId: firstModule.id },
            { type: 'SHOW_QUESTION', exerciseId: firstExercise.id }
        ];
        this._replayLog();
    }

    exit() {
        document.body.classList.remove('chat-mode');
        this.chatWrapper.style.display = 'none';
        this._clearChat();
        this.course = null;
        this.currentChatLog = [];
        if (this.onExit) this.onExit();
    }

    setOnComplete(callback) {
        this.onComplete = callback;
    }

    // === Внутренняя логика ===

    _buildInitialLog() {
        const firstModule = this.course.modules[0];
        const firstExercise = this.course.exercises.find(e => e.module_id === firstModule.id);
        return [
            { type: 'SHOW_MODULE_HEADER', moduleId: firstModule.id },
            { type: 'SHOW_QUESTION', exerciseId: firstExercise.id }
        ];
    }

    _clearChat() {
        this.chatMessages.innerHTML = '';
    }

    _replayLog() {
        this.currentChatLog.forEach(cmd => this._applyCommand(cmd));
    }

    _applyCommand(cmd) {
        switch (cmd.type) {
            case 'SHOW_MODULE_HEADER':
                if (!this.chatMessages.querySelector(`[data-module-id="${cmd.moduleId}"]`)) {
                    this._renderModuleHeader(cmd.moduleId);
                }
                break;
            case 'SHOW_QUESTION':
                const exercise = this.course.exercises.find(e => e.id === cmd.exerciseId);
                if (exercise) {
                    this.core.currentModuleId = exercise.module_id;
                    const exercises = this.course.exercises
                        .filter(e => e.module_id === exercise.module_id)
                        .sort((a, b) => a.difficulty - b.difficulty);
                    this.core.exerciseIndex = exercises.findIndex(e => e.id === exercise.id);
                    this._addMessage('coach', exercise.prompt);
                }
                break;
            case 'ADD_MESSAGE':
                this._addMessage(cmd.role, cmd.text, cmd.thinking);
                break;
            case 'HIDE_THINKING':
                const thinkingEl = this.chatMessages.querySelector('[data-thinking="true"]');
                if (thinkingEl) thinkingEl.remove();
                break;
            case 'COMPLETE_COURSE':
                this._addMessage('coach', '🎉 Курс завершён! Выберите новый курс.');
                if (this.onComplete) this.onComplete();
                break;
        }
    }

    _renderModuleHeader(moduleId) {
        const module = this.course.modules.find(m => m.id === moduleId);
        const headerDiv = document.createElement('div');
        headerDiv.className = 'module-header';
        headerDiv.setAttribute('data-module-id', moduleId);
        headerDiv.innerHTML = `
            <div class="module-divider"></div>
            <div class="module-title">${this._escapeHtml(module.title)}</div>
            <div class="module-description">${this._escapeHtml(module.description)}</div>
            <div class="module-divider"></div>
        `;
        this.chatMessages.appendChild(headerDiv);
    }

    _addMessage(role, text, thinking = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.innerHTML = `<div class="message-bubble">${this._escapeHtml(text)}</div>`;
        if (thinking) {
            messageDiv.setAttribute('data-thinking', 'true');
        }
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;')
            .replace(/</g, '<')
            .replace(/>/g, '>');
    }

    async sendMessage() {
        const text = this.userInput.value.trim();
        if (!text || !this.course) return;

        this.currentChatLog.push({ type: 'ADD_MESSAGE', role: 'user', text });
        this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);
        this.userInput.value = '';
        this.sendBtn.disabled = true;

        const exercise = this.core.getCurrentExercise();
        if (!exercise) return;

        // Thinking indicator
        this.currentChatLog.push({
            type: 'ADD_MESSAGE',
            role: 'coach',
            text: '<span class="thinking">Думаю<span class="timer"> (25s)</span></span>',
            thinking: true
        });
        this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);

        let timeLeft = 25;
        const timerInterval = setInterval(() => {
            timeLeft--;
            const timerEl = this.chatMessages.querySelector('[data-thinking="true"] .timer');
            if (timerEl) timerEl.textContent = ` (${timeLeft}s)`;
            if (timeLeft <= 0) clearInterval(timerInterval);
        }, 1000);

        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        try {
            const providerConfig = window.llmProviderSelector?.getConfig();
            if (!providerConfig) throw new Error('LLM config not available');

            const LLMClientClass = window.LLMClient;
            const llm = new LLMClientClass(providerConfig, this.course);

            const result = await Promise.race([
                llm.validateWithFeedback(exercise, text, this.abortController.signal),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут')), 25000))
            ]);

            clearInterval(timerInterval);
            this.currentChatLog.push({ type: 'HIDE_THINKING' });
            this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);

            if (result.isCorrect) {
                this.currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: '✅ Верно!' });
                this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);

                this.currentChatLog.push({
                    type: 'ADD_MESSAGE',
                    role: 'coach',
                    text: `📘 <strong>Как можно ответить:</strong><br>${this._escapeHtml(exercise.expected_answer)}`
                });
                this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);

                if (this.core.hasNext()) {
                    this.core.next();
                    const nextExercise = this.core.getCurrentExercise();
                    this.currentChatLog.push({ type: 'SHOW_QUESTION', exerciseId: nextExercise.id });
                    this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);
                } else if (this.core.hasNextModule()) {
                    this.core.nextModule();
                    const module = this.course.modules.find(m => m.id === this.core.currentModuleId);
                    this.currentChatLog.push({ type: 'SHOW_MODULE_HEADER', moduleId: module.id });
                    const nextExercise = this.core.getCurrentExercise();
                    this.currentChatLog.push({ type: 'SHOW_QUESTION', exerciseId: nextExercise.id });
                    this._applyCommand(this.currentChatLog[this.currentChatLog.length - 2]);
                    this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);
                } else {
                    this.currentChatLog.push({ type: 'COMPLETE_COURSE' });
                    this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);
                }
            } else {
                const feedback = result.feedback?.trim() || exercise.feedback_on_error || 'Попробуйте ещё раз.';
                this.currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: `💡 ${feedback}` });
                this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);
                this.sendBtn.disabled = false;
            }

            // Сохраняем прогресс
            const version = this.course.metadata.version || '1.0';
            const key = JSON.stringify({ type: 'mindgym_log', courseId: this.courseId, version });
            localStorage.setItem(key, JSON.stringify(this.currentChatLog));

        } catch (error) {
            clearInterval(timerInterval);
            this.currentChatLog.push({ type: 'HIDE_THINKING' });
            this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);

            if (error.name !== 'AbortError') {
                const fallback = exercise.feedback_on_error || 'Превышено время ожидания.';
                this.currentChatLog.push({ type: 'ADD_MESSAGE', role: 'coach', text: `💡 ${fallback}` });
                this._applyCommand(this.currentChatLog[this.currentChatLog.length - 1]);
                this.sendBtn.disabled = false;
            }
        }
    }

    getChatLog() {
        return this.currentChatLog;
    }

    getCourseIdForProgress() {
        return this.course._localId || this.courseId;
    }
}