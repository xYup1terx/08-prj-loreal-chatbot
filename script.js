/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Set initial message
chatWindow.textContent = "👋 Hello! How can I help you today?";

// If you have a deployed Cloudflare Worker, set its URL here (recommended):
// e.g. const WORKER_URL = 'https://your-worker.example.workers.dev/';
const WORKER_URL = "https://loreallll.templeal.workers.dev/"; // <-- set this to your worker URL when available

/**
 * Ask the backend (Cloudflare Worker preferred) or OpenAI directly (insecure for browsers).
 * The Cloudflare Worker should accept POST { messages } and return OpenAI-style response.
 */
async function getAIResponse(prompt) {
  // System message controls the assistant's personality/behavior. Edit this string
  // to change tone, style, constraints, and persona. Keep it concise and single-purpose.
  const SYSTEM_MESSAGE =
    "You are L'Oréal's Smart Product Advisor: helpful, professional, concise, and friendly. Answer with product recommendations, routine advice, and short explanations suitable for general customers. Keep answers non-technical and customer-focused. If you don't know, say you don't know and suggest contacting support. Politely refuse to answer questions unrelated to L’Oréal products, routines, recommendations, beauty-related topics, etc.";

  // Build messages array with system message first, then the user message
  const messages = [
    { role: "system", content: SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ];

  try {
    if (WORKER_URL) {
      // Use the worker as a proxy (recommended) — worker holds the secret server-side
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Worker error: ${res.status} ${txt}`);
      }

      const data = await res.json();
      // Expecting OpenAI-style response: data.choices[0].message.content
      return data?.choices?.[0]?.message?.content || JSON.stringify(data);
    }

    /* Direct OpenAI fallback commented out for production.
    // Fallback: call OpenAI directly from the browser using window.OPENAI_API_KEY
    // WARNING: This exposes the key to anyone who can view your client bundle — not for production.
    const key = window.OPENAI_API_KEY;
    if (!key || key === "YOUR_API_KEY_HERE") {
      throw new Error(
        "No API key available. Provide a Worker URL or set window.OPENAI_API_KEY in secrets.js for local testing."
      );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI error: ${res.status} ${txt}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || JSON.stringify(data);
    */

    // Direct fallback disabled — require WORKER_URL in production.
    throw new Error(
      "Direct OpenAI fallback is disabled. Configure WORKER_URL for production or enable the fallback for local testing."
    );
  } catch (err) {
    console.error("getAIResponse error:", err);
    throw err;
  }
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  // show user message in the UI (basic)
  chatWindow.innerHTML = `<div class="message user">${escapeHtml(text)}</div>`;

  // show loading state
  const loading = document.createElement("div");
  loading.className = "message bot loading";
  loading.textContent = "Thinking...";
  chatWindow.appendChild(loading);

  try {
    const aiText = await getAIResponse(text);
    loading.className = "message bot";
    loading.textContent = aiText;
  } catch (err) {
    loading.className = "message bot error";
    loading.textContent =
      "Error: " + (err.message || "Could not connect to API");
  }
});

// small helper to avoid injecting raw HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
