(() => {
  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const sessionsEl = document.getElementById("sessions");
  const messagesEl = document.getElementById("messages");
  const statInput = document.getElementById("stat-input");
  const statOutput = document.getElementById("stat-output");
  const statCache = document.getElementById("stat-cache");

  let ws = null;
  let retryDelay = 500;
  let activeSession = null;
  let streamingEl = null;

  function getToken() {
    return location.hash.slice(1) || "";
  }

  function connect() {
    const token = getToken();
    const url = `ws://localhost:3100${token ? "?token=" + encodeURIComponent(token) : ""}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      retryDelay = 500;
      statusEl.classList.add("connected");
      statusText.textContent = "connected";
    };

    ws.onclose = () => {
      statusEl.classList.remove("connected");
      statusText.textContent = "disconnected";
      retryDelay = Math.min(retryDelay * 2, 30000);
      setTimeout(connect, retryDelay);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      let frame;
      try { frame = JSON.parse(e.data); } catch { return; }
      handleFrame(frame);
    };
  }

  function handleFrame(frame) {
    if (frame.type === "sessions") {
      renderSessions(frame.sessions || []);
    } else if (frame.type === "agent") {
      handleAgentEvent(frame);
    } else if (frame.type === "usage") {
      updateStats(frame);
    }
  }

  function renderSessions(sessions) {
    if (!sessions.length) {
      sessionsEl.innerHTML = '<div style="padding:12px;color:#8b949e;font-size:13px">No sessions</div>';
      return;
    }
    sessionsEl.innerHTML = sessions
      .map(s => `<div class="session${s.id === activeSession ? " active" : ""}" data-id="${s.id}">${s.channel || "?"}: ${s.from || s.id}</div>`)
      .join("");
    sessionsEl.querySelectorAll(".session").forEach(el => {
      el.addEventListener("click", () => {
        activeSession = el.dataset.id;
        renderSessions(sessions);
      });
    });
  }

  function handleAgentEvent(frame) {
    const ev = frame.event;
    if (!ev) return;

    if (ev.type === "text_delta") {
      if (!streamingEl) {
        streamingEl = document.createElement("div");
        streamingEl.className = "msg assistant streaming";
        messagesEl.appendChild(streamingEl);
      }
      streamingEl.textContent += ev.text;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (ev.type === "text_end" || ev.type === "message_end") {
      if (streamingEl) {
        streamingEl.classList.remove("streaming");
        streamingEl = null;
      }
      if (ev.type === "message_end" && ev.usage) {
        updateStats(ev.usage);
      }
    } else if (ev.type === "user_message") {
      const el = document.createElement("div");
      el.className = "msg user";
      el.textContent = ev.text || "";
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function updateStats(usage) {
    if (usage.inputTokens != null) statInput.textContent = usage.inputTokens.toLocaleString();
    if (usage.outputTokens != null) statOutput.textContent = usage.outputTokens.toLocaleString();
    if (usage.cacheReadTokens != null) statCache.textContent = usage.cacheReadTokens.toLocaleString();
  }

  connect();
})();
