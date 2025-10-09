// course-actions-selector.js
export class CourseActionsSelector {
    constructor(btnId) {
        this.btn = document.getElementById(btnId);
        if (!this.btn) throw new Error('CourseActionsSelector: button not found');
        this.courseType = null;
        this.courseId = null;
        this.menu = null;
        this.init();
    }

    init() {
        // Создаём меню один раз
        this.menu = document.createElement('div');
        this.menu.className = 'course-menu';
        this.menu.style.position = 'absolute';
        this.menu.style.zIndex = '100';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);

        this.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Закрытие при клике вне
        document.addEventListener('click', () => {
            this.hideMenu();
        });
    }

    toggleMenu() {
        if (this.menu.style.display === 'block') {
            this.hideMenu();
        } else {
            this.showMenu();
        }
    }

    showMenu() {
        this.updateMenuContent();
        this.menu.style.display = 'block';
        // Позиционируем под кнопкой
        const btnRect = this.btn.getBoundingClientRect();
        this.menu.style.top = `${btnRect.bottom + window.scrollY}px`;
        this.menu.style.right = `${window.innerWidth - btnRect.right}px`;
    }

    hideMenu() {
        this.menu.style.display = 'none';
    }

    updateMenuContent() {
        const actions = [
            { id: 'reset', text: '↺ Сбросить прогресс', icon: '↺' },
            { id: 'share', text: '🔗 Поделиться', icon: '🔗' }
        ];
        if (this.courseType === 'local') {
            actions.push(
                { id: 'edit', text: '✏️ Редактировать', icon: '✏️' },
                { id: 'delete', text: '🗑️ Удалить курс', icon: '🗑️' }
            );
        }

        this.menu.innerHTML = actions.map(a =>
            `<button class="course-menu-item" data-action="${a.id}">${a.text}</button>`
        ).join('');

        // Обработчики
        this.menu.querySelectorAll('.course-menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                this.onAction?.(action, this.courseId);
                this.hideMenu();
            });
        });
    }

    setCourse(type, id = null) {
        this.courseType = type;
        this.courseId = id;
        this.btn.style.display = type ? 'flex' : 'none';
    }

    setOnAction(callback) {
        this.onAction = callback;
    }
}

export function createCourseActionsSelector(btnId) {
    return new CourseActionsSelector(btnId);
}