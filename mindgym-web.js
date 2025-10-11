// mindgym-web.js
import { Dialog } from './dialog.js';
import { CourseSelector } from './course-selector.js';
import { Landing } from './landing.js';
import { CourseEditor } from './course-editor.js';
import { LLMClient} from "./llm-client.js";
import { createCourseActionsSelector } from './course-actions-selector.js';
import { createLLMProviderSelector } from './llm-provider-selector.js';

// === Глобальные ссылки (для совместимости с LLMClient) ===
let llmSelector;
let dialog;
let courseSelector;
let landing;
let courseEditor;
let courseActionsSelector;

// === Хранилище ===
const Storage = {
    set: (key, value) => localStorage.setItem(`mindgym_${key}`, value),
    get: (key) => localStorage.getItem(`mindgym_${key}`),
    remove: (key) => localStorage.removeItem(`mindgym_${key}`)
};


// === Инициализация ===
document.addEventListener('DOMContentLoaded', async () => {
    // DOM элементы
    const courseSelect = document.getElementById('courseSelect');
    const courseFileInput = document.getElementById('courseFileInput');
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatWrapper = document.getElementById('chatWrapper');
    const landingEl = document.getElementById('landing');
    const demoSection = document.getElementById('demoSection');
    const editorContainer = document.getElementById('courseEditorContainer');
    const appLogo = document.getElementById('appLogo');

    // 1. LLM Selector
    llmSelector = createLLMProviderSelector('llmProviderContainer');
    window.llmProviderSelector = llmSelector;
    window.LLMClient = LLMClient;

    // 2. Диалог
    dialog = new Dialog({
        chatMessagesEl: chatMessages,
        userInputEl: userInput,
        sendBtnEl: sendBtn,
        chatWrapperEl: chatWrapper
    });

    dialog.setOnComplete(() => {
        courseActionsSelector?.setCourse(null);
    });

    // 3. Лендинг + демо
    landing = new Landing(landingEl, demoSection);

    // 4. Селектор курсов
    courseSelector = new CourseSelector(courseSelect, courseFileInput);

    courseSelector.setOnCourseSelect((courseData, courseId, isLocal) => {
        const version = courseData.metadata.version || '1.0';
        const key = JSON.stringify({ type: 'mindgym_log', courseId, version });
        const savedLog = localStorage.getItem(key);
        const parsedLog = savedLog ? JSON.parse(savedLog) : null;
        dialog.start(courseData, courseId, isLocal, parsedLog);
        courseActionsSelector?.setCourse(isLocal ? 'local' : 'official', courseId);
        landing.hide();
    });

    courseSelector.setOnCustomCourse((courseData, localId, isLocalStored) => {
        const id = localId || 'file_' + Date.now().toString(36);
        dialog.start(courseData, id, true);
        courseActionsSelector?.setCourse('local', id);
        landing.hide();
    });

    courseSelector.setOnCreateCourse(() => {
        courseEditor.show();
        landing.hide();
        dialog.exit();
    });

    // 5. Редактор
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
        dialog.start(courseData, newId, true);
        courseActionsSelector?.setCourse('local', newId);
    });

    // 6. Меню действий
    courseActionsSelector = createCourseActionsSelector('courseMenuBtn');
    courseActionsSelector.setOnAction(async (action, courseId) => {
        if (action === 'reset') {
            if (confirm('Сбросить прогресс курса?\nВся история будет удалена.')) {
                dialog.reset();
                const version = dialog.course.metadata.version || '1.0';
                const key = JSON.stringify({ type: 'mindgym_log', courseId, version });
                localStorage.removeItem(key);
            }
        } else if (action === 'share') {
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
        } else if (action === 'edit') {
            const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
            const course = localCourses.find(c => c.id === courseId);
            if (course) {
                courseEditor.show();
                courseEditor.loadCourseData(course.data, courseId);
                dialog.exit();
                landing.hide();
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

    // 7. Логотип → лендинг
    appLogo.addEventListener('click', () => {
        dialog.exit();
        landing.show();
        courseSelect.selectedIndex = 0;
        landing.updateMetaTags();
        courseActionsSelector?.setCourse(null);
    });

    // Инициализация селектора (уже делает fetch)
    await courseSelector.init();

    courseActionsSelector?.setCourse(null);
});