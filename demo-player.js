// demo-player.js

/**
 * Демо-плеер тренинга
 * Использует существующие CSS-классы из styles.css
 */

export class DemoPlayer {
    constructor(containerId, log, options = {}) {
        this.container = document.getElementById(containerId);
        this.log = log;
        this.currentIndex = 0;
        this.activeTasks = 0; // ← вместо isPlaying
        this.intervalId = null;
        this.options = {
            typingDuration: 3000,
            messageDelay: 1800,
            visibilityThreshold: 0.7,
            ...options
        };

        this.init();
    }

    init() {
        if (!this.container) return;

        // Создаём структуру демо-чата
        this.container.innerHTML = `
  <h3 class="demo-title">Как это работает</h3>
  <div class="demo-chat-container">
    <!-- Заголовок модуля -->
    <div class="module-header">
      <div class="module-divider"></div>
      <div class="module-title">${this.log.module.title}</div>
      <div class="module-description">${this.log.module.description}</div>
      <div class="module-divider"></div>
    </div>
    <div class="chat-messages" id="demoChat_${Date.now()}"></div>
    <div class="chat-input demo-input">
      <textarea class="demo-input-field" readonly></textarea>
    </div>
  </div>
  <div class="demo-overlay">
    <div class="play-icon">⏸️</div>
  </div>
`;

        this.chatContainer = this.container.querySelector('.chat-messages');
        this.overlay = this.container.querySelector('.demo-overlay');
        this.typingPlaceholder = this.container.querySelector('.typing-placeholder');

        // Обработчики
        this.overlay.addEventListener('click', () => this.toggle());
        this.setupVisibilityObserver();
    }

    // Добавление сообщения в чат
    addMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.innerHTML = `<div class="message-bubble">${text}</div>`;
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // Воспроизведение одного шага
    async playStep() {
        if (this.activeTasks === 0) return; // пауза

        if (this.currentIndex >= this.log.steps.length) {
            this.chatContainer.innerHTML = '';
            this.currentIndex = 0;
        }

        const step = this.log.steps[this.currentIndex];

        if (step.role === 'user') {
            const prevStep = this.log.steps[this.currentIndex - 1];
            if (prevStep && prevStep.role === 'coach') {
                await this.typeText(step.text);
                if (this.activeTasks === 0) return; // проверка после await
            }
            this.addMessage('user', step.text);
            this.currentIndex++;
        } else {
            this.addMessage('coach', step.text);
            this.currentIndex++;
        }

        if (this.activeTasks > 0) {
            setTimeout(() => this.playStep(), 1800);
        }
    }

    async typeText(text) {
        const inputField = this.container.querySelector('.demo-input-field');
        if (!inputField) return;

        inputField.value = '';
        for (let i = 0; i < text.length; i++) {
            if (this.activeTasks === 0) return; // выход при паузе
            inputField.value = text.substring(0, i + 1);
            await this.sleep(100);
        }
        await this.sleep(600);
        if (this.activeTasks > 0) {
            inputField.value = '';
        }
    }

    // Вспомогательный метод ожидания
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Управление воспроизведением
    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this.activeTasks > 0) return; // уже идёт воспроизведение
        this.activeTasks = 1;
        this.overlay.classList.add('hidden');
        this.playStep();
    }

    pause() {
        this.activeTasks = 0; // немедленная остановка
        this.overlay.classList.remove('hidden');
    }

    // Наблюдатель за видимостью
    setupVisibilityObserver() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.intersectionRatio >= this.options.visibilityThreshold) {
                        this.play();
                    } else if (entry.intersectionRatio <= 0.3) {
                        this.pause();
                    }
                });
            },
            { threshold: [0, 0.3, 0.7, 1] }
        );

        observer.observe(this.container);
    }
}

// Экспортируем функцию для удобства
export function createDemoPlayer(containerId, log, options) {
    return new DemoPlayer(containerId, log, options);
}