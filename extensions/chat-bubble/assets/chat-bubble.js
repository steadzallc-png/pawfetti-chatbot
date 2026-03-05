(() => {
  function createChatUI(endpoint) {
    if (!endpoint) {
      console.warn("Pawfetti chat: no endpoint configured.");
      return;
    }

    const existing = document.querySelector("[data-pawfetti-chat-bubble]");
    if (existing) return;

    const container = document.createElement("div");
    container.dataset.pawfettiChatBubble = "true";
    container.style.position = "fixed";
    container.style.bottom = "20px";
    container.style.right = "20px";
    container.style.zIndex = "2147483647";
    container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const button = document.createElement("button");
    button.setAttribute("aria-label", "Open Pawfetti chat");
    button.style.backgroundColor = "#111827";
    button.style.color = "#ffffff";
    button.style.border = "none";
    button.style.borderRadius = "999px";
    button.style.width = "52px";
    button.style.height = "52px";
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 6px 18px rgba(15,23,42,0.35)";
    button.style.fontSize = "22px";

    const buttonIcon = document.createElement("span");
    buttonIcon.textContent = "💬";
    buttonIcon.style.lineHeight = "1";
    button.appendChild(buttonIcon);

    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.bottom = "76px";
    panel.style.right = "20px";
    panel.style.width = "420px";
    panel.style.maxHeight = "600px";
    panel.style.background = "#ffffff";
    panel.style.borderRadius = "16px";
    panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    panel.style.display = "none";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";
    panel.style.zIndex = "2147483647";

    const header = document.createElement("div");
    header.style.background = "linear-gradient(135deg, #111827, #4b5563)";
    header.style.color = "#ffffff";
    header.style.padding = "10px 14px";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "8px";

    const avatar = document.createElement("div");
    avatar.textContent = "P";
    avatar.style.width = "26px";
    avatar.style.height = "26px";
    avatar.style.borderRadius = "999px";
    avatar.style.background = "rgba(255,255,255,0.1)";
    avatar.style.display = "flex";
    avatar.style.alignItems = "center";
    avatar.style.justifyContent = "center";
    avatar.style.fontSize = "14px";
    avatar.style.fontWeight = "600";

    const headerTextWrap = document.createElement("div");
    const headerTitle = document.createElement("div");
    headerTitle.textContent = "Ask me anything";
    headerTitle.style.fontSize = "13px";
    headerTitle.style.fontWeight = "600";

    const headerSubtitle = document.createElement("div");
    headerSubtitle.textContent = "I can help with products, orders, and policies.";
    headerSubtitle.style.fontSize = "11px";
    headerSubtitle.style.opacity = "0.9";

    headerTextWrap.appendChild(headerTitle);
    headerTextWrap.appendChild(headerSubtitle);
    header.appendChild(avatar);
    header.appendChild(headerTextWrap);

    const messages = document.createElement("div");
    messages.style.flex = "1";
    messages.style.padding = "8px 10px 10px";
    messages.style.overflowY = "auto";
    messages.style.fontSize = "13px";
    messages.style.background = "#f9fafb";
    messages.style.display = "none";

    const emailBar = document.createElement("div");
    emailBar.style.display = "none";
    emailBar.style.flexDirection = "column";
    emailBar.style.alignItems = "stretch";
    emailBar.style.gap = "6px";
    emailBar.style.padding = "8px 10px";
    emailBar.style.borderBottom = "1px solid #e5e7eb";
    emailBar.style.background = "#f3f4f6";

    const emailLabel = document.createElement("span");
    emailLabel.textContent = "Please provide your email in case the session gets disconnected:";
    emailLabel.style.display = "block";
    emailLabel.style.fontSize = "11px";
    emailLabel.style.color = "#374151";
    emailLabel.style.marginBottom = "2px";

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "you@example.com";
    emailInput.style.flex = "1";
    emailInput.style.border = "1px solid #d1d5db";
    emailInput.style.borderRadius = "999px";
    emailInput.style.padding = "4px 8px";
    emailInput.style.fontSize = "11px";
    emailInput.style.outline = "none";

    const emailSkip = document.createElement("button");
    emailSkip.type = "button";
    emailSkip.textContent = "Skip";
    emailSkip.style.border = "none";
    emailSkip.style.background = "transparent";
    emailSkip.style.fontSize = "11px";
    emailSkip.style.cursor = "pointer";
    emailSkip.style.color = "#6b7280";

    const emailContinue = document.createElement("button");
    emailContinue.type = "button";
    emailContinue.textContent = "Continue";
    emailContinue.style.border = "none";
    emailContinue.style.background = "transparent";
    emailContinue.style.fontSize = "11px";
    emailContinue.style.cursor = "pointer";
    emailContinue.style.color = "#111827";

    emailBar.appendChild(emailLabel);
    emailBar.appendChild(emailInput);

    const emailActions = document.createElement("div");
    emailActions.style.display = "flex";
    emailActions.style.justifyContent = "flex-end";
    emailActions.style.gap = "8px";

    emailActions.appendChild(emailSkip);
    emailActions.appendChild(emailContinue);
    emailBar.appendChild(emailActions);

    let emailAddress = null;

    try {
      const stored = window.localStorage.getItem("pawfetti_chat_email");
      if (stored) {
        emailAddress = stored;
      }
    } catch (_e) {
      // Ignore storage errors
    }

    const quickLinks = document.createElement("div");
    quickLinks.style.display = "flex";
    quickLinks.style.flexWrap = "wrap";
    quickLinks.style.gap = "4px";
    quickLinks.style.padding = "6px 8px 6px 8px";
    quickLinks.style.borderBottom = "1px solid #e5e7eb";
    quickLinks.style.background = "#f9fafb";

    function addQuickLink(label, handlerOrPath) {
      const link = document.createElement("button");
      link.type = "button";
      link.textContent = label;
      link.style.border = "1px solid #d1d5db";
      link.style.borderRadius = "999px";
      link.style.background = "#ffffff";
      link.style.padding = "2px 8px";
      link.style.fontSize = "11px";
      link.style.cursor = "pointer";
      link.style.color = "#111827";
      link.addEventListener("click", () => {
        if (typeof handlerOrPath === "function") {
          handlerOrPath();
        } else {
          const url = new URL(handlerOrPath, window.location.origin);
          window.open(url.toString(), "_blank");
        }
      });
      quickLinks.appendChild(link);
    }

    addQuickLink("Refund policy", "/policies/refund-policy");
    addQuickLink("Return policy", "/policies/return-policy");
    addQuickLink("Terms & conditions", "/policies/terms-of-service");

    const form = document.createElement("form");
    form.style.display = "none";
    form.style.borderTop = "1px solid #e5e7eb";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask about products...";
    input.style.flex = "1";
    input.style.border = "none";
    input.style.padding = "8px 10px";
    input.style.fontSize = "13px";
    input.style.outline = "none";

    const sendBtn = document.createElement("button");
    sendBtn.type = "submit";
    sendBtn.textContent = "Send";
    sendBtn.style.background = "transparent";
    sendBtn.style.border = "none";
    sendBtn.style.padding = "0 10px 0 0";
    sendBtn.style.cursor = "pointer";
    sendBtn.style.color = "#111827";
    sendBtn.style.fontSize = "13px";
    sendBtn.style.fontWeight = "500";

    form.appendChild(input);
    form.appendChild(sendBtn);
    panel.appendChild(header);
    panel.appendChild(emailBar);
    panel.appendChild(quickLinks);
    panel.appendChild(messages);
    panel.appendChild(form);

    function showChatInterface() {
      quickLinks.style.display = "none";
      emailBar.style.display = "none";
      messages.style.display = "block";
      form.style.display = "flex";
      if (!messages.hasChildNodes()) {
        addMessage("Hi, I’m the Pawfetti assistant. How can I help you today?", "assistant");
      }
    }

    addQuickLink("Chat with an agent", () => {
      if (emailAddress) {
        showChatInterface();
      } else {
        quickLinks.style.display = "none";
        emailBar.style.display = "flex";
      }
    });

    emailSkip.addEventListener("click", () => {
      showChatInterface();
    });

    emailContinue.addEventListener("click", () => {
      const value = emailInput.value.trim();
      if (value) {
        emailAddress = value;
        try {
          window.localStorage.setItem("pawfetti_chat_email", value);
        } catch (_e) {
          // Ignore storage errors
        }
      }
      showChatInterface();
    });

    button.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "flex" : "none";
    });

    function addMessage(text, role) {
      const bubble = document.createElement("div");
      bubble.textContent = text;
      bubble.style.margin = "4px 0";
      bubble.style.padding = "6px 8px";
      bubble.style.borderRadius = "10px";
      bubble.style.maxWidth = "90%";
      bubble.style.wordBreak = "break-word";
      if (role === "user") {
        bubble.style.background = "#111827";
        bubble.style.color = "#ffffff";
        bubble.style.marginLeft = "auto";
      } else {
        bubble.style.background = "#e5e7eb";
        bubble.style.color = "#111827";
        bubble.style.marginRight = "auto";
      }
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      addMessage(text, "user");
      input.value = "";

      try {
        addMessage("Thinking...", "assistant");
        const thinkingBubble = messages.lastChild;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: text, history: [], email: emailAddress }),
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const data = await res.json();
        const reply = data && data.reply ? data.reply : "Sorry, I couldn't process that.";
        thinkingBubble.textContent = reply;
      } catch (error) {
        console.error("Pawfetti chat error:", error);
        addMessage("Sorry, something went wrong. Please try again.", "assistant");
      }
    });

    container.appendChild(button);
    document.body.appendChild(container);
    document.body.appendChild(panel);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("pawfetti-chat-root");
    if (!root) return;

    const endpoint = root.getAttribute("data-endpoint") || "/api/chat";
    createChatUI(endpoint);
  });
})();

