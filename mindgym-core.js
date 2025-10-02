class MindGymCore {
  constructor() {
    this.course = null;
    this.currentModuleId = null;
    this.exerciseIndex = 0;
  }

  loadCourse(data) {
    this.course = data;
    const firstModule = data.modules[0];
    this.currentModuleId = firstModule.id;
    this.exerciseIndex = 0;
  }

  getCurrentExercise() {
    if (!this.course || !this.currentModuleId) return null;
    const exercises = this.course.exercises
      .filter(e => e.module_id === this.currentModuleId)
      .sort((a, b) => a.difficulty - b.difficulty);
    return exercises[this.exerciseIndex] || null;
  }

  hasNext() {
    const exercises = this.course.exercises.filter(e => e.module_id === this.currentModuleId);
    return this.exerciseIndex < exercises.length - 1;
  }

  next() {
    this.exerciseIndex++;
  }

  async validate(exercise, userAnswer, provider) {
    return await provider.validate(exercise, userAnswer);
  }
}