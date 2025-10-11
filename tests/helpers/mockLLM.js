export function mockLLM(page) {
  // OpenRouter / OpenAI / Mistral
  page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '{"isCorrect":true,"feedback":""}' } }]
      })
    });
  });
  // Ollama
  page.route('http://localhost:11434/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: '{"isCorrect":true,"feedback":""}' })
    });
  });
}
