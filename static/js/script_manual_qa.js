async function criarTestesManuais() {
    const nome = document.getElementById("nome").value;
    const telefone = document.getElementById("telefone").value;
    const quantidade = document.getElementById("quantidade").value;

    if (!nome || !telefone || isNaN(quantidade)) {
        Swal.fire({ icon: "error", title: "Erro", text: "Preencha todos os campos corretamente." });
        return;
    }

    const formData = new FormData();
    formData.append("nome", nome);
    formData.append("telefone", telefone);
    formData.append("quantidade", quantidade);

    Swal.fire({ title: "Criando testes...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const response = await fetch("/qa/criar-testes-multiplos-manuais", {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        Swal.close();

        const container = document.getElementById("testesContainer");
        container.innerHTML = "";

        for (let tel in data.testes) {
            const arquivo_id = data.testes[tel];
            arquivosIds.push(arquivo_id);

            const card = document.createElement("div");
            card.className = "teste-card";
            card.id = `container${arquivo_id}`;

            card.innerHTML = `
                <h3>Teste para: ${tel} (ID: ${arquivo_id})</h3>
                <div id="mensagens${arquivo_id}" class="mensagens-container"></div>
                <div style="margin-top:10px;">
                    <input type="text" id="input-${arquivo_id}" placeholder="Digite sua mensagem..." style="width:70%; padding:8px; border-radius:8px; border:1px solid #ccc;">
                    <button class="botao-enviar" onclick="enviarMensagemManual('${arquivo_id}')">📤 Enviar</button>
                </div>
                <button class="botao-encerrar" onclick="encerrarWebSocket('${arquivo_id}')">🛑 Encerrar</button>
            `;

            container.appendChild(card);
            conectarWebSocket(arquivo_id);
        }

        Swal.fire({ icon: "success", title: "Testes iniciados!" });

    } catch (error) {
        Swal.close();
        console.error("Erro ao criar testes:", error);
        Swal.fire({ icon: "error", title: "Erro", text: "Falha ao criar testes manuais." });
    }
}

function conectarWebSocket(arquivo_id) {
    let protocolo = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    let wsUrl = `${protocolo}://${host}/ws/notificacao-manual/${arquivo_id}`;

    console.log("📡 Conectando ao WebSocket (manual):", wsUrl);
    let ws = new WebSocket(wsUrl);
    wsConnections[arquivo_id] = ws;

    ws.onmessage = function (event) {
        let data = JSON.parse(event.data);
        console.log(`📩 [Manual] Mensagem recebida para ${arquivo_id}:`, data);

        if (data.status === "end") {
            Swal.fire({ icon: "info", title: "Sessão encerrada", text: data.mensagem_recebida, timer: 4000 });
            ws.close();
            wsConnections[arquivo_id] = null;

            const botao = document.querySelector(`#container${arquivo_id} .botao-encerrar`);
            if (botao) {
                botao.textContent = "🟢 Ativar";
                botao.onclick = () => conectarWebSocket(arquivo_id);
                botao.classList.remove("botao-encerrar");
                botao.classList.add("botao-ativar");
            }
            return;
        }

        if (data.status === "bot") {
            adicionarMensagem(data.mensagem_recebida, "🤖 Bot", "green", data.timestamp, "bot", arquivo_id);
        }

        if (data.status === "info") {
            const container = document.querySelector(`#container${arquivo_id}`);
            if (!container) return;

            const infoId = `info-${arquivo_id}`;
            if (document.getElementById(infoId)) return;

            const btnInfo = document.createElement("button");
            btnInfo.textContent = "📋 Detalhes do Teste";
            btnInfo.className = "botao-enviar";
            btnInfo.style.marginTop = "10px";

            btnInfo.onclick = () => {
                const infoBox = document.createElement("div");
                infoBox.className = "resumo-teste";
                infoBox.innerHTML = `
                    <h4>ℹ️ Informações do Teste</h4>
                    <p>${data.mensagem_recebida.replace(/\n/g, "<br>")}</p>
                `;
                container.appendChild(infoBox);
                btnInfo.remove();
            };

            btnInfo.id = infoId;
            container.appendChild(btnInfo);
        }
    };

    ws.onclose = function () {
        console.log(`❌ Conexão WebSocket manual encerrada para ${arquivo_id}`);
    };

    const botao = document.querySelector(`#container${arquivo_id} .botao-ativar`);
    if (botao) {
        botao.textContent = "🛑 Encerrar";
        botao.onclick = () => encerrarWebSocket(arquivo_id);
        botao.classList.remove("botao-ativar");
        botao.classList.add("botao-encerrar");
    }
}

function enviarMensagemManual(arquivo_id) {
    const ws = wsConnections[arquivo_id];
    const input = document.getElementById(`input-${arquivo_id}`);
    const mensagem = input.value.trim();

    if (mensagem && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ mensagem }));
        adicionarMensagem(mensagem, "👤 Usuário", "blue", new Date().toLocaleTimeString(), "usuario", arquivo_id);
        input.value = "";
    } else {
        Swal.fire({ icon: "error", title: "Erro", text: "WebSocket não conectado ou mensagem vazia." });
    }
}
