// llm-provider-selector.js

export class LLMProviderSelector {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`LLMProviderSelector: container #${containerId} not found`);
        }
        this.config = this.loadConfig();
        this.init();
    }

    static PROVIDERS = {
        ollama: {
            name: 'Ollama',
            helpUrl: 'https://ollama.com/',
            defaultModel: 'qwen3:4b',
            logo: '🧠'
        },
        openrouter: {
            name: 'OpenRouter',
            helpUrl: 'https://openrouter.ai/keys',
            defaultModel: 'qwen/qwen3-8b:free',
            logo: '☁️'
        },
        openai: {
            name: 'OpenAI',
            helpUrl: 'https://platform.openai.com/api-keys',
            defaultModel: 'gpt-4o-mini',
            logo: '🔷'
        },
        mistral: {
            name: 'Mistral',
            helpUrl: 'https://console.mistral.ai/api-keys/',
            defaultModel: 'mistral-small-latest',
            logo: '🟣'
        },
        custom: {
            name: 'Custom',
            helpUrl: null,
            defaultModel: '',
            logo: '🔧'
        }
    };

    static STORAGE_KEY = 'mindgym_llm_provider_v4';

    // === Загрузка: восстанавливаем текущий + все сохранённые конфиги ===
    loadConfig() {
        const saved = localStorage.getItem(LLMProviderSelector.STORAGE_KEY);
        const data = saved ? JSON.parse(saved) : {};

        const currentType = data._current || 'ollama';
        const providers = data.providers || {};

        // Восстанавливаем конфиг текущего провайдера
        const current = providers[currentType] || {
            key: '',
            url: '',
            model: LLMProviderSelector.PROVIDERS[currentType]?.defaultModel || ''
        };

        return {
            currentType,
            providers,
            current
        };
    }

    // === Сохранение: обновляем только текущий провайдер ===
    saveConfig(partial) {
        // Обновляем локальное состояние
        this.config.current = { ...this.config.current, ...partial };

        // Читаем всё из localStorage
        const saved = localStorage.getItem(LLMProviderSelector.STORAGE_KEY);
        const data = saved ? JSON.parse(saved) : { providers: {} };

        // Сохраняем конфиг текущего провайдера
        data.providers[this.config.currentType] = this.config.current;

        // Сохраняем активный провайдер
        data._current = this.config.currentType;

        // Пишем обратно
        localStorage.setItem(LLMProviderSelector.STORAGE_KEY, JSON.stringify(data));

        this.onConfigChange?.(this.getConfig());
    }

    // === Публичный API ===
    getConfig() {
        return {
            type: this.config.currentType,
            key: this.config.current.key,
            url: this.config.current.url,
            model: this.config.current.model
        };
    }

    setOnConfigChange(callback) {
        this.onConfigChange = callback;
    }

    // === Инициализация DOM ===
    init() {
        this.renderStaticHTML();
        this.bindEvents();
        this.updateUI();
    }

    renderStaticHTML() {
        this.container.innerHTML = `
            <div class="llm-control">
                <select class="llm-provider-select" id="llmProviderSelect">
                    ${Object.entries(LLMProviderSelector.PROVIDERS).map(([id, p]) =>
            `<option value="${id}">${p.logo} ${p.name}</option>`
        ).join('')}
                </select>

                <span class="llm-placeholder" id="llmPlaceholder">http://localhost:11434</span>

                <input type="text" class="llm-model-input" id="llmModelInput" placeholder="Модель" />
                <input type="url" class="llm-url-input" id="llmUrlInput" placeholder="URL" />
                <input type="password" class="llm-key-input" id="llmKeyInput" placeholder="Токен" />

                <a class="llm-help-link" id="llmHelpLink" target="_blank" title="Получить ключ">?</a>
                <button class="llm-clear-btn" id="llmClearConfig" title="Очистить настройки">×</button>
            </div>
        `;

        this.elements = {
            select: this.container.querySelector('#llmProviderSelect'),
            placeholder: this.container.querySelector('#llmPlaceholder'),
            model: this.container.querySelector('#llmModelInput'),
            url: this.container.querySelector('#llmUrlInput'),
            key: this.container.querySelector('#llmKeyInput'),
            help: this.container.querySelector('#llmHelpLink'),
            clear: this.container.querySelector('#llmClearConfig')
        };
    }

    bindEvents() {
        this.elements.select.addEventListener('change', (e) => {
            const newType = e.target.value;

            // Сохраняем текущий конфиг перед переключением
            this.saveConfig({});

            // Переключаемся
            this.config.currentType = newType;

            // Загружаем сохранённый или дефолтный конфиг
            const savedForNew = this.config.providers[newType] || {
                key: '',
                url: '',
                model: LLMProviderSelector.PROVIDERS[newType]?.defaultModel || ''
            };
            this.config.current = savedForNew;

            this.updateUI();
            this.saveConfig({}); // сохраняем выбор как активный
        });

        ['model', 'url', 'key'].forEach(field => {
            this.elements[field].addEventListener('input', (e) => {
                let value = e.target.value;
                if (field === 'key' && value && !value.includes('*')) {
                    this.config.current.key = value;
                    e.target.value = '*'.repeat(value.length);
                    value = this.config.current.key;
                }
                this.saveConfig({ [field]: value });
            });
        });

        this.elements.clear.addEventListener('click', () => {
            if (confirm('Очистить настройки провайдера?\nТокен, URL и модель будут удалены.')) {
                this.saveConfig({
                    key: '',
                    url: '',
                    model: LLMProviderSelector.PROVIDERS[this.config.currentType]?.defaultModel || ''
                });
                this.updateUI();
            }
        });
    }

    updateUI() {
        const provider = LLMProviderSelector.PROVIDERS[this.config.currentType];

        // Селект
        this.elements.select.value = this.config.currentType;

        // Плейсхолдер vs поля
        if (this.config.currentType === 'ollama') {
            this.elements.placeholder.hidden = false;
            this.elements.model.hidden = true;
            this.elements.url.hidden = true;
            this.elements.key.hidden = true;
        } else {
            this.elements.placeholder.hidden = true;
            this.elements.model.hidden = false;
            this.elements.url.hidden = (this.config.currentType !== 'custom');
            this.elements.key.hidden = false;
        }

        // Значения
        this.elements.model.value = this.config.current.model || '';
        this.elements.url.value = this.config.current.url || '';
        if (this.config.current.key) {
            this.elements.key.value = '*'.repeat(this.config.current.key.length);
        } else {
            this.elements.key.value = '';
        }

        // Ссылка помощи
        if (provider?.helpUrl) {
            this.elements.help.href = provider.helpUrl;
            this.elements.help.hidden = false;
        } else {
            this.elements.help.hidden = true;
        }
    }
}

export function createLLMProviderSelector(containerId) {
    return new LLMProviderSelector(containerId);
}