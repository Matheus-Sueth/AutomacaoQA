function adicionarCampoExtra() {
    const container = document.getElementById("extras-container");
    if (container.children.length >= 7) {
        Swal.fire({ icon: "warning", title: "Limite atingido", text: "Você pode adicionar no máximo 7 campos." });
        return;
    }

    const div = document.createElement("div");
    div.className = "campo-extra";

    const inputChave = document.createElement("input");
    inputChave.type = "text";
    inputChave.placeholder = "Chave";
    inputChave.maxLength = 200;

    const inputValor = document.createElement("input");
    inputValor.type = "text";
    inputValor.placeholder = "Valor";
    inputValor.maxLength = 200;

    const btnRemover = document.createElement("button");
    btnRemover.textContent = "❌";
    btnRemover.onclick = () => div.remove();

    div.appendChild(inputChave);
    div.appendChild(inputValor);
    div.appendChild(btnRemover);
    container.appendChild(div);
}


async function criarTestesManuais() {
    const checkboxes = document.querySelectorAll("input[name='numeros']:checked");
    const numerosSelecionados = Array.from(checkboxes).map(cb => cb.value);

    if (numerosSelecionados.length === 0) {
        Swal.fire({ icon: "error", title: "Erro", text: "Selecione ao menos um número e defina a quantidade." });
        return;
    }

    const formData = new FormData();
    for (let numero of numerosSelecionados) {
        formData.append("numeros", numero);
    }

    const extras = document.querySelectorAll("#extras-container .campo-extra");
    for (let campo of extras) {
        const chave = campo.children[0].value.trim();
        const valor = campo.children[1].value.trim();

        if (chave && valor) {
            formData.append(`extras[${chave}]`, valor);
        }
    }

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
        Swal.fire({ icon: "error", title: "Erro", text: error.message });
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

            const infoBoxId = `info-box-${arquivo_id}`;
            let infoBox = document.getElementById(infoBoxId);
            let btnInfo = document.getElementById(`info-btn-${arquivo_id}`);

            if (!infoBox) {
                infoBox = document.createElement("div");
                infoBox.id = infoBoxId;
                infoBox.className = "resumo-teste";
                infoBox.innerHTML = `<h4>ℹ️ Informações do Teste</h4>`;
                infoBox.style.display = "none";
                container.appendChild(infoBox);
            }

            const bloco = document.createElement("div");
            bloco.className = "bloco-info";

            const texto = document.createElement("p");
            texto.innerHTML = data.mensagem_recebida.replace(/\n/g, "<br>");
            bloco.appendChild(texto);

            const time = document.createElement("small");
            time.textContent = `🕒 ${data.timestamp}`;
            bloco.appendChild(time);

            const linha = document.createElement("hr");
            bloco.appendChild(linha);

            infoBox.appendChild(bloco);

            if (!btnInfo) {
                btnInfo = document.createElement("button");
                btnInfo.textContent = "📋 Detalhes do Teste";
                btnInfo.className = "botao-enviar";
                btnInfo.style.marginTop = "10px";
                btnInfo.id = `info-btn-${arquivo_id}`;

                btnInfo.onclick = () => {
                    if (infoBox.style.display === "none") {
                        infoBox.style.display = "block";
                        btnInfo.textContent = "🙈 Esconder Detalhes";
                    } else {
                        infoBox.style.display = "none";
                        btnInfo.textContent = "📋 Detalhes do Teste";
                    }
                };

                container.appendChild(btnInfo);
            }
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
