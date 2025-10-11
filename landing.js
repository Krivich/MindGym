// landing.js
import { createDemoPlayer } from './demo-player.js';

export class Landing {
    constructor(landingEl, demoSectionEl) {
        this.landingEl = landingEl;
        this.demoSectionEl = demoSectionEl;
        this.init();
    }

    init() {
        // Демо-лог
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

        createDemoPlayer('demoSection', UNIVERSAL_DEMO_LOG, {
            typingDuration: 3000,
            messageDelay: 1800
        });

        // Обновление метатегов
        this.updateMetaTags();
    }

    show() {
        document.body.classList.remove('chat-mode');
        this.landingEl.style.display = 'flex';
        this.demoSectionEl.style.display = 'block';
    }

    hide() {
        this.landingEl.style.display = 'none';
        this.demoSectionEl.style.display = 'none';
    }

    updateMetaTags(course = null) {
        const baseUrl = 'https://krivich.github.io/MindGym';
        let title, description, url;
        if (course) {
            title = `${course.metadata.title} — MindGym`;
            description = course.metadata.description || `Интерактивный курс по ${course.metadata.title.toLowerCase()}.`;
            const courseId = course.metadata._filename ? this._getCourseIdByFile(course.metadata._filename) : 'custom';
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

    _getCourseIdByFile(filename) {
        const index = JSON.parse(localStorage.getItem('mindgym_course_index') || '[]');
        const entry = index.find(c => c.file === filename);
        return entry ? entry.id : 'unknown';
    }
}