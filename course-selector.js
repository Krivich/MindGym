// course-selector.js

export class CourseSelector {
    constructor(selectEl, fileInputEl) {
        this.select = selectEl;
        this.fileInput = fileInputEl;
        this.courseIndex = [];
        this.onCourseSelect = null;
        this.onCustomCourse = null;
        this.onCreateCourse = null;

        // this.init();
    }

    async init() {
        // Загружаем официальные курсы
        const res = await fetch('courses/index.json');
        this.courseIndex = await res.json();
        this.courseIndex.forEach(course => {
            const opt = document.createElement('option');
            opt.value = course.file;
            opt.textContent = course.title;
            this.select.appendChild(opt);
        });

        // Локальные курсы
        const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
        localCourses.forEach(course => {
            const opt = document.createElement('option');
            opt.value = `__local__${course.id}`;
            opt.textContent = `💾 ${course.title}`;
            this.select.appendChild(opt);
        });

        // Доп. опции
        const uploadOption = document.createElement('option');
        uploadOption.value = '__upload__';
        uploadOption.textContent = '📁 Загрузить из файла…';
        this.select.appendChild(uploadOption);

        const createOption = document.createElement('option');
        createOption.value = '__create__';
        createOption.textContent = '✨ Создать курс с ИИ';
        this.select.appendChild(createOption);

        // События
        this.select.addEventListener('change', (e) => this._handleChange(e));
        this.fileInput.addEventListener('change', (e) => this._handleFileUpload(e));

        // Drag & drop
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length && files[0].name.endsWith('.json')) {
                this._loadFile(files[0]);
            }
        });

        // Прямая ссылка
        const courseId = this._getCourseIdFromUrl();
        if (courseId) {
            const entry = this.courseIndex.find(c => c.id === courseId);
            if (entry) {
                this.select.value = entry.file;
                this._triggerCourseLoad(entry.file, false);
                history.replaceState(null, '', window.location.pathname);
            }
        }
    }

    _handleChange(e) {
        const value = e.target.value;
        // e.target.selectedIndex = 0; // сброс

        if (value === '__create__') {
            if (this.onCreateCourse) this.onCreateCourse();
            // Опционально: сбросить выбор, если это "действие", а не курс
            this.select.value = '';
        } else if (value.startsWith('__local__')) {
            const id = value.replace('__local__', '');
            const localCourses = JSON.parse(localStorage.getItem('mindgym_local_courses') || '[]');
            const course = localCourses.find(c => c.id === id);
            if (course && this.onCustomCourse) {
                this.onCustomCourse(course.data, id, true);
            }
        } else if (value === '__upload__') {
            this.fileInput.click();
        } else if (value) {
            this._triggerCourseLoad(value, false);
        }
    }

    async _triggerCourseLoad(file, isLocal) {
        if (file.endsWith('.json')) {
            const res = await fetch(`courses/${file}`);
            const data = await res.json();
            data.metadata._filename = file;
            const courseId = this._getCourseIdByFile(file);
            if (this.onCourseSelect) this.onCourseSelect(data, courseId, isLocal);
        }
    }

    _handleFileUpload(e) {
        const file = e.target.files?.[0];
        if (file) this._loadFile(file);
    }

    _loadFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const courseData = JSON.parse(event.target.result);
                if (this.onCustomCourse) this.onCustomCourse(courseData, null, false);
            } catch (err) {
                alert('Ошибка: неверный формат JSON');
            }
        };
        reader.readAsText(file);
    }

    _getCourseIdByFile(filename) {
        const entry = this.courseIndex.find(c => c.file === filename);
        return entry ? entry.id : 'unknown';
    }

    _getCourseIdFromUrl() {
        let courseId = window.location.hash.replace('#', '');
        if (!courseId) {
            const path = window.location.pathname;
            const parts = path.split('/');
            courseId = parts[parts.length - 1];
        }
        if (courseId && courseId !== 'MindGym' && courseId !== '') {
            return courseId;
        }
        return null;
    }

    setOnCourseSelect(callback) {
        this.onCourseSelect = callback;
    }

    setOnCustomCourse(callback) {
        this.onCustomCourse = callback;
    }

    setOnCreateCourse(callback) {
        this.onCreateCourse = callback;
    }
}