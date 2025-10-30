/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Conversation state (persisted in localStorage)
const STORAGE_KEY = "loreal_conversation_v1";
const STORAGE_NAME_KEY = "loreal_user_name";

// System message controls the assistant's personality/behavior. Edit this string
// to change tone, style, constraints, and persona. Keep it concise and single-purpose.
const SYSTEM_MESSAGE =
  "You are L'Oréal's Smart Product Advisor: helpful, professional, concise, and friendly. Answer with product recommendations, routine advice, and short explanations suitable for general customers. Keep answers non-technical and customer-focused. If you don't know, say you don't know and suggest contacting support. Politely refuse to answer questions unrelated to L’Oréal products, routines, recommendations, or beauty-related topics.";

// Load or initialize conversation messages (system message first)
let conversation = loadConversation();

// If conversation is empty, initialize with system message and a greeting
if (!conversation || conversation.length === 0) {
  conversation = [{ role: "system", content: SYSTEM_MESSAGE }];
  appendSystemGreeting();
  saveConversation();
} else {
  // Render existing conversation
  renderConversation();
}

// If you have a deployed Cloudflare Worker, set its URL here (recommended):
// e.g. const WORKER_URL = 'https://your-worker.example.workers.dev/';
const WORKER_URL = "https://loreallll.templeal.workers.dev/"; // <-- set this to your worker URL when available

/**
 * Ask the backend (Cloudflare Worker preferred) or OpenAI directly (insecure for browsers).
 * The Cloudflare Worker should accept POST { messages } and return OpenAI-style response.
 */
/**
 * Send the full messages array (including system & history) to the backend and return assistant text
 * messages: Array of {role, content}
 */
async function getAIResponse(messages) {
  try {
    if (!Array.isArray(messages)) {
      throw new Error("getAIResponse expects an array of messages");
    }

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

  // Try to detect a name from the user's message (no prompt). If found, store it
  // and add a system-level user profile message once so the assistant can use it.
  let userName = localStorage.getItem(STORAGE_NAME_KEY);
  if (!userName) {
    const extracted = extractNameFromText(text);
    if (extracted) {
      userName = extracted;
      localStorage.setItem(STORAGE_NAME_KEY, userName);
      // Only add the profile message if we don't already have one
      const hasProfile = conversation.some(
        (m) => m.role === "system" && /User profile: name is/i.test(m.content)
      );
      if (!hasProfile) {
        conversation.splice(1, 0, {
          role: "system",
          content: `User profile: name is ${userName}. Address the user as ${userName}. Keep responses concise.`,
        });
      }
    }
  }

  // Add user message to conversation and UI
  const userMsg = { role: "user", content: text };
  conversation.push(userMsg);
  appendChatMessage("user", text);
  saveConversation();

  // show loading state
  const loading = document.createElement("div");
  loading.className = "msg ai loading";
  loading.textContent = "Thinking...";
  chatWindow.appendChild(loading);

  try {
    // send the whole conversation (system + history + user)
    const aiText = await getAIResponse(conversation);

    // append assistant message to conversation and UI
    const assistantMsg = { role: "assistant", content: aiText };
    // replace loading element with assistant message
    loading.className = "msg ai";
    loading.textContent = aiText;
    conversation.push(assistantMsg);
    saveConversation();
  } catch (err) {
    loading.className = "msg ai error";
    loading.textContent =
      "Error: " + (err.message || "Could not connect to API");
  } finally {
    userInput.value = "";
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

/* ----------------- helper UI & storage functions ----------------- */
function appendChatMessage(who, text) {
  const div = document.createElement("div");
  div.className = who === "user" ? "msg user" : "msg ai";
  div.innerHTML = escapeHtml(text);
  chatWindow.appendChild(div);
  // scroll to bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderConversation() {
  chatWindow.innerHTML = "";
  // skip system messages when rendering chat bubbles
  conversation.forEach((m) => {
    if (m.role === "system") return;
    const who = m.role === "user" ? "user" : "ai";
    const div = document.createElement("div");
    div.className = `msg ${who}`;
    div.innerHTML = escapeHtml(m.content);
    chatWindow.appendChild(div);
  });
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function saveConversation() {
  try {
    // limit size to last 30 messages (plus system messages at the start)
    const systemParts = conversation.filter((m) => m.role === "system");
    const chatParts = conversation.filter((m) => m.role !== "system");
    const trimmed = chatParts.slice(-30);
    const toStore = [...systemParts, ...trimmed];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.warn("Could not save conversation:", e);
  }
}

function loadConversation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Could not load conversation:", e);
    return null;
  }
}

function appendSystemGreeting() {
  // initial greeting shown in UI
  chatWindow.innerHTML = "";
  const div = document.createElement("div");
  div.className = "msg ai";
  div.textContent = "👋 Hello! How can I help you today?";
  chatWindow.appendChild(div);
}

/* Try to extract a user's name from a free-form sentence.
   Returns a cleaned name string (title-cased) or null if none found. */
function extractNameFromText(text) {
  if (!text || typeof text !== "string") return null;
  const patterns = [
    /\bmy name is\s+([A-Za-z][A-Za-z'\- ]{0,60})/i,
    /\bcall me\s+([A-Za-z][A-Za-z'\- ]{0,60})/i,
    /\bi am\s+([A-Za-z][A-Za-z'\- ]{0,60})/i,
    /\bi'm\s+([A-Za-z][A-Za-z'\- ]{0,60})/i,
    /\bthis is\s+([A-Za-z][A-Za-z'\- ]{0,60})/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const raw = m[1].trim();
      // sanitize: remove trailing punctuation
      const cleaned = raw.replace(/[.,!?]$/g, "");
      return toTitleCase(cleaned);
    }
  }

  return null;
}

function toTitleCase(s) {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
