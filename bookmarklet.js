(async function () {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    background: linear-gradient(135deg, rgba(26, 0, 51, 0.9), rgba(0, 0, 0, 0.8));
    backdrop-filter: blur(10px);
    color: white; z-index: 9999;
    font-family: 'Segoe UI', sans-serif;
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 0 15px rgba(0,0,0,0.5);
  `;

  const title = document.createElement("h1");
  title.innerText = "MoonExp";
  title.style.cssText = `
    font-size: 24px;
    text-align: center;
    margin-bottom: 10px;
    background: linear-gradient(90deg, #a100ff, #ff00c8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  `;

  const subtitle = document.createElement("p");
  subtitle.innerText = "Aguardando tarefas...";
  subtitle.style.cssText = `color: #ccc; text-align: center; margin-top: 5px;`;

  const progressBarWrapper = document.createElement("div");
  progressBarWrapper.style.cssText = `
    width: 100%; height: 10px; background: rgba(255,255,255,0.1);
    border-radius: 5px; margin-top: 20px; overflow: hidden;
  `;
  const progressBar = document.createElement("div");
  progressBar.style.cssText = `
    height: 100%; width: 0%; background: linear-gradient(90deg, #a100ff, #ff00c8);
    transition: width 0.4s ease;
  `;
  progressBarWrapper.appendChild(progressBar);

  const logBox = document.createElement("div");
  logBox.style.cssText = `
    width: 100%;
    max-height: 150px;
    margin-top: 20px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    overflow-y: auto;
    font-size: 14px;
  `;

  overlay.appendChild(title);
  overlay.appendChild(subtitle);
  overlay.appendChild(progressBarWrapper);
  overlay.appendChild(logBox);
  document.body.appendChild(overlay);

  const toastContainer = document.createElement("div");
  toastContainer.id = "moon-toast-container";
  toastContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 99999;
  `;
  document.body.appendChild(toastContainer);

  function showToast(message, success = true) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      background: ${success ? '#2ecc71' : '#e74c3c'};
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 0 8px rgba(0,0,0,0.3);
      position: relative;
      overflow: hidden;
    `;
    toast.innerText = message;
    const progress = document.createElement("div");
    progress.style.cssText = `
      position: absolute;
      bottom: 0; left: 0;
      height: 3px;
      background: white;
      width: 100%;
      animation: toastProgress 4s linear forwards;
    `;
    toast.appendChild(progress);
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes toastProgress {
      0% { width: 100%; }
      100% { width: 0%; }
    }
  `;
  document.head.appendChild(style);

  function updateProgress(percent, message) {
    progressBar.style.width = percent + "%";
    subtitle.innerText = message;
  }

  function logTask(name, success = true) {
    const entry = document.createElement("div");
    entry.innerHTML = success
      ? `<span style='color: #a1ffa1;'>✅ ${name}</span>`
      : `<span style='color: #ffa1a1;'>❌ ${name}</span>`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
    showToast(`${success ? '✅' : '❌'} ${name}`, success);
  }

  async function retry(fn, retries = 3, delay = 2000) {
    try {
      return await fn();
    } catch (e) {
      if (e.message.includes("429") && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return retry(fn, retries - 1, delay * 2);
      }
      throw e;
    }
  }

  async function processResource(id, name) {
    try {
      logTask(`Iniciando: ${name}`);
      await retry(() => fetch(`https://expansao.educacao.sp.gov.br/mod/resource/view.php?id=${id}`, {
        method: "GET",
        credentials: "include"
      }));
      logTask(`Página concluída: ${name}`);
      return true;
    } catch (e) {
      logTask(`Erro ao completar página ${name}: ${e.message}`, false);
      return false;
    }
  }

  async function processForum(id, name) {
    try {
      logTask(`Iniciando: ${name}`);
      await retry(() => fetch(`https://expansao.educacao.sp.gov.br/mod/forum/view.php?id=${id}`, {
        method: "GET",
        credentials: "include"
      }));
      logTask(`Fórum concluído: ${name}`);
      return true;
    } catch (e) {
      logTask(`Erro ao completar fórum ${name}: ${e.message}`, false);
      return false;
    }
  }

  async function processQuiz(link, name) {
    try {
      logTask(`Iniciando avaliação: ${name}`);
      const url = new URL(link);
      const id = url.searchParams.get('id');

      const res1 = await retry(() => fetch(link, { method: "GET", credentials: "include" }));
      if (!res1.ok) throw new Error(`Erro: ${res1.status}`);
      const html1 = await res1.text();
      const sesskeyMatch = html1.match(/sesskey=["']?([^"']+)/);
      const sesskey = sesskeyMatch ? sesskeyMatch[1] : null;
      if (!sesskey) throw new Error("Chave de sessão não encontrada");

      const startData = new URLSearchParams();
      startData.append("cmid", id);
      startData.append("sesskey", sesskey);
      const startRes = await retry(() => fetch("https://expansao.educacao.sp.gov.br/mod/quiz/startattempt.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: startData.toString(),
        redirect: "follow"
      }));
      if (!startRes.ok) throw new Error(`Erro ao iniciar tentativa: ${startRes.status}`);
      const redirectUrl = startRes.url;
      const attemptIdMatch = redirectUrl.match(/attempt=(\d+)/);
      const attemptId = attemptIdMatch ? attemptIdMatch[1] : null;
      if (!attemptId) throw new Error("ID da tentativa não encontrado");

      const res2 = await retry(() => fetch(redirectUrl, { method: "GET", credentials: "include" }));
      if (!res2.ok) throw new Error(`Erro: ${res2.status}`);
      const html2 = await res2.text();
      const doc2 = new DOMParser().parseFromString(html2, "text/html");
      const inputs = doc2.querySelectorAll("input[type='hidden']");
      const formData = { attempt: attemptId, sesskey };
      let questId, seqCheck;
      inputs.forEach(input => {
        const name = input.getAttribute("name");
        const value = input.getAttribute("value");
        if (name && name.includes(":sequencecheck")) {
          [questId] = name.split(":");
          seqCheck = value;
        } else if (name) {
          formData[name] = value;
        }
      });
      const radioInputs = doc2.querySelectorAll("input[type='radio']");
      const options = Array.from(radioInputs)
        .filter(input => input.getAttribute("name")?.includes("_answer") && input.getAttribute("value") !== "-1")
        .map(input => ({
          name: input.getAttribute("name"),
          value: input.getAttribute("value")
        }));
      if (options.length === 0) throw new Error("Nenhuma opção de resposta encontrada");

      const selectedOption = options[Math.floor(Math.random() * options.length)];
      const answerData = new FormData();
      answerData.append(`${questId}:1_:flagged`, "0");
      answerData.append(`${questId}:1_:sequencecheck`, seqCheck);
      answerData.append(selectedOption.name, selectedOption.value);
      answerData.append("next", "Finalizar tentativa ...");
      answerData.append("attempt", attemptId);
      Object.entries(formData).forEach(([key, value]) => {
        if (!["attempt", "sesskey"].includes(key)) answerData.append(key, value);
      });
      answerData.append("sesskey", sesskey);
      answerData.append("slots", "1");
      const postRes = await retry(() => fetch(`https://expansao.educacao.sp.gov.br/mod/quiz/processattempt.php?cmid=${id}`, {
        method: "POST",
        credentials: "include",
        body: answerData,
        redirect: "follow"
      }));
      if (!postRes.ok) throw new Error(`Erro ao enviar resposta: ${postRes.status}`);

      const summaryData = new URLSearchParams();
      summaryData.append("attempt", attemptId);
      summaryData.append("finishattempt", "1");
      summaryData.append("timeup", "0");
      summaryData.append("slots", "");
      summaryData.append("cmid", id);
      summaryData.append("sesskey", sesskey);
      const finishRes = await retry(() => fetch("https://expansao.educacao.sp.gov.br/mod/quiz/processattempt.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: summaryData.toString(),
        redirect: "follow"
      }));
      if (!finishRes.ok) throw new Error(`Erro ao finalizar: ${finishRes.status}`);

      logTask(`Avaliação concluída: ${name}`);
      return true;
    } catch (e) {
      logTask(`Falha ao completar: ${name} - ${e.message}`, false);
      return false;
    }
  }

  class TaskQueue {
    constructor(delay = 1600) {
      this.tasks = [];
      this.isProcessing = false;
      this.delay = delay;
    }
    async add(task) {
      return new Promise((resolve, reject) => {
        this.tasks.push({ task, resolve, reject });
        if (!this.isProcessing) this.process();
      });
    }
    async process() {
      if (this.tasks.length === 0) {
        this.isProcessing = false;
        return;
      }
      this.isProcessing = true;
      const { task, resolve, reject } = this.tasks.shift();
      try {
        const result = await retry(task);
        resolve(result);
      } catch (e) {
        reject(e);
      }
      setTimeout(() => this.process(), this.delay);
    }
  }

  async function processAll() {
    const activities = document.querySelectorAll("li.activity");
    const resources = [];
    const quizzes = [];
    activities.forEach(activity => {
      const link = activity.querySelector("a.aalink");
      const complete = activity.querySelector(".completion-dropdown button");
      if (link && link.href && (!complete || !complete.classList.contains("btn-success"))) {
        const url = new URL(link.href);
        const id = url.searchParams.get('id');
        const name = link.textContent.trim();
        if (id) {
          if (/responda|pause/i.test(name)) {
            quizzes.push({ href: link.href, name });
          } else {
            resources.push({ id, name });
          }
        }
      }
    });

    const total = resources.length + quizzes.length;
    let done = 0;
    updateProgress(0, "Preparando para processar atividades...");

    const queue = new TaskQueue(1600);
    logTask(`Encontradas ${resources.length} páginas e ${quizzes.length} avaliações`);

    updateProgress(Math.round((done / total) * 100), "Processando páginas...");
    for (let i = 0; i < resources.length; i++) {
      const { id, name } = resources[i];
      const percent = Math.floor((done / total) * 100);
      updateProgress(percent, `Processando páginas (${i + 1}/${resources.length})`);
      try {
        await queue.add(() => processResource(id, name));
        done++;
      } catch (e) {
        logTask(`Erro na página ${name}: ${e.message}`, false);
      }
    }

    updateProgress(Math.round((done / total) * 100), "Processando avaliações...");
    for (let i = 0; i < quizzes.length; i++) {
      const { href, name } = quizzes[i];
      const percent = Math.floor((done / total) * 100);
      updateProgress(percent, `Processando avaliações (${i + 1}/${quizzes.length})`);
      try {
        await queue.add(() => processQuiz(href, name));
        done++;
      } catch (e) {
        logTask(`Erro na avaliação ${name}: ${e.message}`, false);
      }
    }

    updateProgress(100, "Todas as atividades foram processadas.");
    logTask("Todas atividades e avaliações processadas com sucesso!");
    showToast("✅ Atividades finalizadas!", true);
    setTimeout(() => location.reload(), 2500);
  }

  try {
    await processAll();
  } catch (e) {
    logTask(`Erro fatal: ${e.message}`, false);
    updateProgress(100, "Processo falhou!");
  }
})();
