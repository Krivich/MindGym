// course-editor.js
export class CourseEditor {
    constructor(containerId) {
        this.editingId = null;
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error('CourseEditor: container not found');
        this.courseData = this.getDefaultCourse();
        this.init();
    }

    getDefaultCourse() {
        return {
            metadata: {
                title: 'Новый курс',
                validation_prompt: 'Ты — эксперт по теме курса. Оцени ответ пользователя.'
            },
            modules: [{
                id: 'm1',
                title: 'Модуль 1',
                description: 'Описание модуля',
                order: 1
            }],
            exercises: [{
                id: 'e1',
                module_id: 'm1',
                prompt: 'Ситуация...',
                expected_answer: 'Идеальный ответ...',
                feedback_on_error: 'Подсказка при ошибке...',
                difficulty: 2
            }]
        };
    }

    init() {
        this.container.innerHTML = `
            <div class="editor-ai" id="editorAiSection"></div>
            <div class="editor-form" id="editorForm"></div>
            <div class="editor-actions-bottom" id="editorActionsBottom"></div>
        `;
        this.renderForm();
        this.renderAISection();
        this.renderActionsBottom();
        // Добавляем контейнер для ошибок
        const errorEl = document.createElement('div');
        errorEl.className = 'editor-error';
        errorEl.id = 'editorError';
        this.container.appendChild(errorEl);

        this.bindFormEvents();
    }

    renderForm() {
        const form = this.container.querySelector('#editorForm');
        form.innerHTML = `
            <h2 class="editor-title">Редактор курса</h2>
            <div class="floating-input">
                <input type="text" id="courseTitle" class="editor-input required" placeholder=" " value="${this.escape(this.courseData.metadata.title)}" data-required>
                <label for="courseTitle">Название курса <span class="required-star">*</span></label>
            </div>
            <div class="floating-input">
                <textarea id="validationPrompt" class="editor-textarea required" rows="3" placeholder=" ">${this.escape(this.courseData.metadata.validation_prompt)}</textarea>
                <label for="validationPrompt">Промпт для ИИ <span class="required-star">*</span></label>
            </div>
            
            <div id="modulesContainer"></div>
            <button class="editor-btn primary" id="addModule">+ Модуль</button>
            <button class="editor-btn" id="addModuleWithAI" hidden="hidden">+ Модуль ✨</button>
        `;
        this.renderModules();
    }

    renderModules() {
        const container = this.container.querySelector('#modulesContainer');
        container.innerHTML = '';
        this.courseData.modules.forEach((module) => {
            const exercises = this.courseData.exercises.filter(e => e.module_id === module.id);
            const moduleEl = document.createElement('div');
            moduleEl.className = 'module-card';
            moduleEl.draggable = true;
            moduleEl.dataset.moduleId = module.id;
            moduleEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', module.id);
            });
            moduleEl.addEventListener('dragover', (e) => e.preventDefault());
            moduleEl.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                this.reorderModules(draggedId, module.id);
            });
            moduleEl.innerHTML = `
                <button class="remove-btn" data-id="${module.id}" title="Удалить">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div class="floating-input">
                    <input type="text" class="module-title-input editor-input" placeholder=" " value="${this.escape(module.title)}" data-id="${module.id}">
                    <label>Название модуля</label>
                </div>
                <div class="floating-input">
                    <textarea class="module-desc-input editor-textarea" placeholder=" " data-id="${module.id}">${this.escape(module.description)}</textarea>
                    <label>Описание модуля</label>
                </div>
                <div class="exercises-list" id="exercises_${module.id}"></div>
                <button class="editor-btn" data-module-id="${module.id}">+ Упражнение</button>
                <button class="editor-btn" data-module-id="${module.id}" id="addExerciseWithAI_${module.id}" hidden="hidden">+ Упражнение ✨</button>

            `;
            container.appendChild(moduleEl);
            this.renderExercises(module.id, exercises);
        });
    }

    renderExercises(moduleId, exercises) {
        const list = this.container.querySelector(`#exercises_${moduleId}`);
        list.innerHTML = '';
        exercises.forEach(ex => {
            const exEl = document.createElement('div');
            exEl.className = 'exercise-card';
            exEl.innerHTML = `
                <button class="remove-btn ex-remove" data-id="${ex.id}" title="Удалить упражнение">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div class="floating-input">
                    <textarea class="ex-prompt editor-textarea" placeholder=" " data-id="${ex.id}">${this.escape(ex.prompt)}</textarea>
                    <label>Ситуация</label>
                </div>
                <div class="floating-input">
                    <textarea class="ex-expected editor-textarea" placeholder=" " data-id="${ex.id}">${this.escape(ex.expected_answer)}</textarea>
                    <label>Идеальный ответ</label>
                </div>
                <div class="floating-input">
                    <textarea class="ex-feedback editor-textarea" placeholder=" " data-id="${ex.id}">${this.escape(ex.feedback_on_error)}</textarea>
                    <label>Подсказка при ошибке</label>
                </div>
                <div class="floating-input floating-input--select" style="flex:1;">
                    <select class="editor-select" data-id="${ex.id}">
                        <option value="1" ${ex.difficulty === 1 ? 'selected' : ''}>1 — Простое</option>
                        <option value="2" ${ex.difficulty === 2 ? 'selected' : ''}>2 — Среднее</option>
                        <option value="3" ${ex.difficulty === 3 ? 'selected' : ''}>3 — Сложное</option>
                    </select>
                    <label>Сложность</label>
                </div>
            `;
            list.appendChild(exEl);
        });
    }

    renderAISection() {
        this.container.querySelector('#editorAiSection').innerHTML = `
            
                <h3>✨ Создать курс с ИИ</h3>
                <div class="floating-input">
                    <textarea id="aiPrompt" class="editor-textarea" placeholder=" ">Опишите тему, цель, аудиторию...</textarea>
                    <label>Описание курса для ИИ</label>
                </div>
                <button class="editor-btn primary" id="generateWithAI">Сгенерировать</button>
            
        `;
    }

    renderActionsBottom() {
        this.container.querySelector('#editorActionsBottom').innerHTML = `
            <div class="editor-actions-bottom">
<button class="editor-btn" id="importJson">📥 Импорт</button>
<button class="editor-btn primary" id="exportJson">📤 Экспорт</button>
                <button class="editor-btn primary" id="launchCourse">▶️ Запустить курс</button>
            </div>
        `;
    }

    escape(str) {
        return str.replace(/</g, '<').replace(/>/g, '>');
    }

    bindFormEvents() {
        // === Обработка ввода текста (без кнопок!) ===
        this.container.addEventListener('input', (e) => {
            const { target } = e;
            if (target.classList.contains('module-title-input')) {
                const mod = this.courseData.modules.find(m => m.id === target.dataset.id);
                if (mod) mod.title = target.value;
            } else if (target.classList.contains('module-desc-input')) {
                const mod = this.courseData.modules.find(m => m.id === target.dataset.id);
                if (mod) mod.description = target.value;
            } else if (target.classList.contains('ex-prompt')) {
                const ex = this.courseData.exercises.find(e => e.id === target.dataset.id);
                if (ex) ex.prompt = target.value;
            } else if (target.classList.contains('ex-expected')) {
                const ex = this.courseData.exercises.find(e => e.id === target.dataset.id);
                if (ex) ex.expected_answer = target.value;
            } else if (target.classList.contains('ex-feedback')) {
                const ex = this.courseData.exercises.find(e => e.id === target.dataset.id);
                if (ex) ex.feedback_on_error = target.value;
            } else if (target.id === 'courseTitle') {
                this.courseData.metadata.title = target.value;
            } else if (target.id === 'validationPrompt') {
                this.courseData.metadata.validation_prompt = target.value;
            }
            // ⚠️ УБРАНО: обработка кнопок из input!
        });

        // === Обработка КЛИКОВ (включая кнопки ИИ) ===
        this.container.addEventListener('click', async (e) => {
            if (e.target.id === 'addModule') {
                const id = `m${Date.now()}`;
                this.courseData.modules.push({
                    id,
                    title: `Модуль ${this.courseData.modules.length + 1}`,
                    description: 'Новое описание',
                    order: this.courseData.modules.length + 1
                });
                this.renderModules();
            } else if (e.target.textContent === '+ Упражнение') {
                const moduleId = e.target.dataset.moduleId;
                const id = `e${Date.now()}`;
                this.courseData.exercises.push({
                    id,
                    module_id: moduleId,
                    prompt: 'Новая ситуация...',
                    expected_answer: 'Идеальный ответ...',
                    feedback_on_error: 'Подсказка...',
                    difficulty: 2
                });
                this.renderModules();
            } else if (e.target.classList.contains('remove-btn')) {
                if (confirm('Удалить? Это действие нельзя отменить.')) {
                    const id = e.target.dataset.id;
                    if (e.target.classList.contains('ex-remove')) {
                        this.courseData.exercises = this.courseData.exercises.filter(e => e.id !== id);
                    } else {
                        this.courseData.modules = this.courseData.modules.filter(m => m.id !== id);
                        this.courseData.exercises = this.courseData.exercises.filter(e => e.module_id !== id);
                    }
                    this.renderModules();
                }
            }
            // ✅ Кнопки ИИ — ТОЛЬКО здесь, с async/await
            else if (e.target.id === 'addModuleWithAI') {
                await this.addModuleWithAI();
            } else if (e.target.id.startsWith('addExerciseWithAI_')) {
                const moduleId = e.target.dataset.moduleId;
                await this.addExerciseWithAI(moduleId);
            }
        });

        // === Остальные обработчики (экспорт, импорт, запуск, генерация) ===
        this.container.querySelector('#exportJson').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(this.courseData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.courseData.metadata.title.replace(/\s+/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        this.container.querySelector('#importJson').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (ev) => {
                const file = ev.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        this.courseData = JSON.parse(e.target.result);
                        this.renderForm();
                    } catch (err) {
                        alert('Неверный JSON');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });

        // Экспорт
        this.container.querySelector('#exportJson').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(this.courseData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.courseData.metadata.title.replace(/\s+/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Импорт
        this.container.querySelector('#importJson').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (ev) => {
                const file = ev.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        this.courseData = JSON.parse(e.target.result);
                        this.renderForm();
                    } catch (err) {
                        alert('Неверный JSON');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });

        // Запуск
        // Обновляем обработчик запуска
        this.container.querySelector('#launchCourse').removeEventListener('click', () => {});
        this.container.querySelector('#launchCourse').addEventListener('click', () => {
            if (this.validateForm()) {
                this.onLaunch?.(this.courseData, this.editingId);
            }
        });

        this.container.querySelector('#generateWithAI').addEventListener('click', async () => {
            await this.generateWithAI();
        });
    }

    reorderModules(draggedId, targetId) {
        if (draggedId === targetId) return;
        const dragged = this.courseData.modules.find(m => m.id === draggedId);
        const target = this.courseData.modules.find(m => m.id === targetId);
        if (!dragged || !target) return;
        // Обмен order
        [dragged.order, target.order] = [target.order, dragged.order];
        // Сортируем по order для корректного отображения
        this.courseData.modules.sort((a, b) => a.order - b.order);
        this.renderModules();
    }

    // Аналогично для упражнений (упрощённо — меняем позиции в массиве)
    reorderExercises(moduleId, fromIndex, toIndex) {
        const exercises = this.courseData.exercises.filter(e => e.module_id === moduleId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= exercises.length || toIndex >= exercises.length) return;
        const [moved] = exercises.splice(fromIndex, 1);
        exercises.splice(toIndex, 0, moved);
        // Обновляем весь список упражнений
        this.courseData.exercises = [
            ...this.courseData.exercises.filter(e => e.module_id !== moduleId),
            ...exercises
        ];
        this.renderModules();
    }

    validateForm() {
        let isValid = true;
        const errorMessages = [];

        // Сброс ошибок
        this.container.querySelectorAll('.floating-input').forEach(el => {
            el.classList.remove('invalid');
        });
        this.container.querySelector('#editorError').textContent = '';

        // Обязательные поля в метаданных
        const title = this.courseData.metadata.title?.trim();
        if (!title) {
            isValid = false;
            this.markInvalid('courseTitle');
            errorMessages.push('Укажите название курса');
        }

        const prompt = this.courseData.metadata.validation_prompt?.trim();
        if (!prompt) {
            isValid = false;
            this.markInvalid('validationPrompt');
            errorMessages.push('Укажите промпт для ИИ');
        }

        // Проверка модулей
        if (this.courseData.modules.length === 0) {
            isValid = false;
            errorMessages.push('Добавьте хотя бы один модуль');
        } else {
            this.courseData.modules.forEach((mod, idx) => {
                if (!mod.title?.trim()) {
                    isValid = false;
                    errorMessages.push(`Укажите название модуля ${idx + 1}`);
                }
            });
        }

        // Проверка упражнений
        if (this.courseData.exercises.length === 0) {
            isValid = false;
            errorMessages.push('Добавьте хотя бы одно упражнение');
        } else {
            this.courseData.exercises.forEach((ex, idx) => {
                if (!ex.prompt?.trim() || !ex.expected_answer?.trim()) {
                    isValid = false;
                    errorMessages.push(`Заполните упражнение ${idx + 1}`);
                }
            });
        }

        // Показ ошибок
        if (!isValid) {
            this.container.querySelector('#editorError').textContent = errorMessages.join('\n');
        }

        return isValid;
    }

    markInvalid(fieldId) {
        const input = this.container.querySelector(`#${fieldId}`);
        if (input) {
            const floatingInput = input.closest('.floating-input');
            if (floatingInput) {
                floatingInput.classList.add('invalid');
            }
        }
    }



    loadFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.courseData = JSON.parse(e.target.result);
                this.renderForm();
            } catch (err) {
                alert('Неверный JSON');
            }
        };
        reader.readAsText(file);
    }

    show() {
        this.container.style.display = 'flex';
    }

    hide() {
        this.container.style.display = 'none';
    }

    setOnLaunch(callback) {
        this.onLaunch = callback;
    }

    loadCourseData(data, id = null) {
        this.courseData = data;
        this.editingId = id; // запоминаем, что редактируем существующий
        this.renderForm();
    }

    async generateWithAI() {
        const aiPromptEl = this.container.querySelector('#aiPrompt');
        const userPrompt = aiPromptEl.value.trim();
        if (!userPrompt) {
            alert('Опишите курс для ИИ');
            return;
        }

        const btn = this.container.querySelector('#generateWithAI');
        const originalText = btn.textContent;
        let timeLeft = 120; // 120 секунд
        btn.disabled = true;
        btn.innerHTML = `Думаю... (${timeLeft}s)`;

        const timer = setInterval(() => {
            timeLeft--;
            btn.innerHTML = `Думаю... (${timeLeft}s)`;
            if (timeLeft <= 0) clearInterval(timer);
        }, 1000);

        try {
            // Получаем конфиг из глобального селектора
            if (typeof window.createLLMClient === 'undefined') {
                throw new Error('createLLMClient не инициализирован');
            }
            // Создаём клиент
            const llmClient = window.createLLMClient();

            // Формируем инструкции
            const systemInstructions = `
Ты — эксперт по созданию интерактивных тренингов для MindGym.
Следуй строго методичке:

${this.getGuide()}

Верни ТОЛЬКО валидный JSON в формате MindGym, без пояснений, без markdown, без текста до/после.
`.trim();

            // Генерируем
            const signal = AbortSignal.timeout(120000);
            const rawResponse = await llmClient.generateCourse(userPrompt, systemInstructions, signal);

            // Очищаем и парсим
            const cleanJson = rawResponse
                .replace(/^```json\s*/i, '')
                .replace(/```$/, '')
                .trim();

            const newCourse = JSON.parse(cleanJson);
            this.courseData = newCourse;
            this.renderForm();
            this.container.querySelector('#editorError').textContent = '✅ Курс сгенерирован!';

        } catch (err) {
            console.error('AI Generation error:', err);
            this.container.querySelector('#editorError').textContent =
                'Ошибка: ' + (err.message || 'проверьте консоль');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;

            clearInterval(timer);
        }
    }

    async addModuleWithAI() {
        await this._generateAndInsert('module', null);
    }

    async addExerciseWithAI(moduleId) {
        await this._generateAndInsert('exercise', moduleId);
    }

    async _generateAndInsert(type, moduleId = null) {
        const btn = event?.currentTarget || document.activeElement;
        if (!btn) return;

        const originalText = btn.innerHTML;
        let timeLeft = 120; // 120 секунд
        btn.disabled = true;
        btn.innerHTML = `Думаю... (${timeLeft}s)`;

        const timer = setInterval(() => {
            timeLeft--;
            btn.innerHTML = `Думаю... (${timeLeft}s)`;
            if (timeLeft <= 0) clearInterval(timer);
        }, 1000);

        try {
            if (typeof window.createLLMClient === 'undefined') {
                throw new Error('LLM не настроен');
            }
            const llmClient = window.createLLMClient();

            // Формируем промпт
            let systemInstructions, userPrompt;
            if (type === 'module') {
                systemInstructions = `
Ты — эксперт по созданию курсов для MindGym.
Создай ОДИН новый модуль в формате JSON:
{
  "id": "уникальный_строковый_id",
  "title": "...",
  "description": "...",
  "order": ${this.courseData.modules.length + 1}
}
Верни ТОЛЬКО этот объект, без пояснений.
`;
                userPrompt = `Курс: "${this.courseData.metadata.title}". Добавь модуль на тему, связанную с курсом.`;
            } else {
                const module = this.courseData.modules.find(m => m.id === moduleId);
                systemInstructions = `
Ты — эксперт по созданию курсов для MindGym.
Создай ОДНО новое упражнение в формате JSON:
{
  "id": "уникальный_строковый_id",
  "module_id": "${moduleId}",
  "prompt": "...",
  "expected_answer": "...",
  "feedback_on_error": "...",
  "difficulty": 2
}
Верни ТОЛЬКО этот объект, без пояснений.
`;
                userPrompt = `Модуль: "${module.title}". Добавь упражнение по теме модуля.`;
            }

            const signal = AbortSignal.timeout(1200000); // 120 сек
            const raw = await llmClient.generateCourse(userPrompt, systemInstructions, signal);
            const clean = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            const newItem = JSON.parse(clean);

            if (type === 'module') {
                this.courseData.modules.push(newItem);
            } else {
                this.courseData.exercises.push(newItem);
            }
            this.renderForm();
            this.container.querySelector('#editorError').textContent = `✅ ${type === 'module' ? 'Модуль' : 'Упражнение'} добавлено!`;

        } catch (err) {
            console.error(err);
            this.container.querySelector('#editorError').textContent = `Ошибка: ${err.message}`;
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    getGuide() {
        return `
## Структура курса
Курс — это JSON с полями: metadata, modules, exercises.

## metadata
- title: краткое название (до 50 символов)
- description: SEO-описание (до 160 символов)
- version: "1.0"
- validation_prompt: роль ИИ и критерии оценки (обязательно!)

## modules
Массив объектов:
- id: уникальный строковый ID (например, "m1")
- title: заголовок модуля
- description: 1–2 предложения о чём модуль
- order: число (1, 2, 3...)

## exercises
Массив объектов:
- id: уникальный ID (например, "e1")
- module_id: ссылка на модуль
- prompt: контекст + вопрос (2–3 предложения)
- expected_answer: короткий, разговорный, уникальный ответ (3–8 слов)
- feedback_on_error: только разбор ошибки, без похвалы
- difficulty: 1–4

## Важно!
- Все поля обязательны.
- expected_answer должен быть уникальным для кейса.
- feedback_on_error НЕ должен начинаться с "Верно", "Правильно", "Отлично".
- Возвращай ТОЛЬКО JSON, без пояснений.
`;
    }
}
