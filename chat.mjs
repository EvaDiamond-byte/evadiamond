const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

const toggle = $("bi-toggle");
const app = $("bi-app");
const close = $("bi-close");
const msgs = $("bi-msgs");
const go = $("bi-go");

toggle.addEventListener("click", () => app.classList.remove("hide"));
close.addEventListener("click", () => app.classList.add("hide"));

function addMessage(text, kind="bot") {
  const el = document.createElement("div");
  el.className = `bi-msg ${kind === "user" ? "bi-user" : "bi-bot"}`;
  el.innerHTML = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

async function research() {
  const name = $("bi-name").value.trim();
  const researchType = $("bi-type").value;
  const question = $("bi-q").value.trim();

  if (!name) {
    addMessage("Please enter the person's name.");
    return;
  }

  addMessage(`<b>Person:</b> ${esc(name)}<br><b>Research:</b> ${esc(researchType)}`, "user");
  const loading = addMessage("🔎 BioIntel is researching connected public sources…");
  go.disabled = true;

  try {
    const response = await fetch("/.netlify/functions/research", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({name, researchType, question})
    });

    const data = await response.json();
    loading.remove();

    if (!response.ok) throw new Error(data.error || "Research request failed.");

    let html = `<div><b>${esc(data.person || name)}</b></div>`;
    if (data.maritalStatus) html += `<p><b>Public marital-status finding:</b><br>${esc(data.maritalStatus)}</p>`;
    if (data.answer) html += `<p>${esc(data.answer).replace(/\n/g,"<br>")}</p>`;

    if (Array.isArray(data.sources) && data.sources.length) {
      html += `<hr><b>Sources</b>`;
      for (const source of data.sources) {
        html += `<div style="padding:8px 0;border-bottom:1px solid #eee">
          <a target="_blank" rel="noopener noreferrer" href="${esc(source.url)}">${esc(source.title || source.url)}</a>
        </div>`;
      }
    }

    addMessage(html);
  } catch (error) {
    loading.remove();
    addMessage(`⚠️ ${esc(error.message)}<br><br><small>Make sure the Netlify Function is deployed and its environment variables are configured.</small>`);
  } finally {
    go.disabled = false;
  }
}

go.addEventListener("click", research);
$("bi-name").addEventListener("keydown", e => {
  if (e.key === "Enter") research();
});
