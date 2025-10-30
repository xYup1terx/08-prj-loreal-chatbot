// Copy this code into your Cloudflare Worker script

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.OPENAI_API_KEY; // Make sure to name your secret OPENAI_API_KEY in the Cloudflare Workers dashboard
    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const userInput = await request.json();

    // Extract the user's latest message text for classification
    const userMessage =
      (userInput.messages &&
        userInput.messages.find((m) => m.role === "user")?.content) ||
      userInput.text ||
      "";

    // Simple server-side enforcement: classify whether the user's question is in-scope
    // (answerable using L'Oréal products/brand expertise). We run a short classifier
    // prompt. If classification returns out-of-scope, we politely refuse to answer.
    // This prevents clients from bypassing the rule.
    async function classifyInScope(text) {
      try {
        const clfBody = {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a strict classifier. Decide whether the user's question can be answered using L'Oréal product knowledge, routines, or brand information. Return ONLY valid JSON with two fields: { \"in_scope\": true|false, \"reason\": string }. \nRules: If the user asks about other brands only, unrelated topics (politics, sports, recipes, medical diagnosis), or requests comparisons focusing on non-L'Oréal brands, return in_scope: false. If the question can be answered by recommending L'Oréal products, routines, or brand details, return in_scope: true. Be concise.",
            },
            { role: "user", content: text },
          ],
          max_completion_tokens: 60,
        };

        const clfRes = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(clfBody),
        });

        if (!clfRes.ok)
          return { in_scope: true, reason: "classifier error fallback: allow" };

        const clfData = await clfRes.json();
        const textResp = clfData?.choices?.[0]?.message?.content || "";

        // Attempt to parse JSON from the classifier; if parsing fails, be permissive.
        try {
          const parsed = JSON.parse(textResp);
          return { in_scope: !!parsed.in_scope, reason: parsed.reason || "" };
        } catch (e) {
          // If classifier didn't return JSON, fall back to simple text checks
          const lowered = textResp.toLowerCase();
          if (
            lowered.includes("false") ||
            lowered.includes("out_of_scope") ||
            lowered.includes("no")
          ) {
            return { in_scope: false, reason: textResp };
          }
          return {
            in_scope: true,
            reason: "classifier ambiguous fallback: allow",
          };
        }
      } catch (err) {
        // On errors, allow by default to avoid blocking legitimate requests
        return { in_scope: true, reason: "classifier error fallback: allow" };
      }
    }

    const classification = await classifyInScope(userMessage);

    if (!classification.in_scope) {
      // Polite refusal response (format resembles OpenAI chat completion for compatibility)
      const refusal = {
        id: null,
        object: "chat.completion",
        created: Date.now(),
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content:
                "I'm sorry — I can only answer questions related to L'Oréal products, routines, and brand information. Please ask about L'Oréal products or contact L'Oréal support for help with other brands or unrelated topics.",
            },
            finish_reason: "stop",
          },
        ],
      };

      return new Response(JSON.stringify(refusal), { headers: corsHeaders });
    }

    // If in-scope, forward the original messages to OpenAI
    const requestBody = {
      model: "gpt-4o",
      messages: userInput.messages,
      max_completion_tokens: 300,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), { headers: corsHeaders });
  },
};
