let arquivosIds = [];
let nome, telefoneBase;
let wsConnections = {};


function conectarWebSocket(arquivo_id) {
    let protocolo = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    let wsUrl = `${protocolo}://${host}/ws/notificacoes/${arquivo_id}`;

    console.log("📡 Conectando ao WebSocket:", wsUrl);

    let ws = new WebSocket(wsUrl);
    wsConnections[arquivo_id] = ws;

    // Contadores de status
    let statusContador = {
        success: 0,
        error: 0,
        pendente: 0
    };

    ws.onmessage = function (event) {
        let data = JSON.parse(event.data);
        console.log(`📩 Mensagem recebida para ${arquivo_id}:`, data);

        // Caso receba o status "end", finaliza o teste
        if (data.status === "end") {
            console.log(`✅ Testes finalizados para ${arquivo_id}. Fechando WebSocket.`);
            ws.close();
            wsConnections[arquivo_id] = null;

            // Esconder a caixa de mensagens
            let mensagensDiv = document.getElementById(`mensagens${arquivo_id}`);
            mensagensDiv.style.display = "none";

            // Criar o resumo do teste
            let resumoDiv = document.createElement("div");
            resumoDiv.className = "resumo-teste";
            resumoDiv.style.padding = "10px";
            resumoDiv.style.border = "1px solid #ccc";
            resumoDiv.style.borderRadius = "8px";
            resumoDiv.style.marginTop = "10px";
            resumoDiv.style.background = "#f4f4f4";

            resumoDiv.innerHTML = `
                <h4>Resumo:</h4>
                <p>✅ Sucessos: <strong>${statusContador.success}</strong></p>
                <p>❌ Erros: <strong>${statusContador.error}</strong></p>
                <p>⌛ Enviadas: <strong>${statusContador.pendente}</strong></p>
            `;

            let container = document.getElementById(`container${arquivo_id}`);
            container.appendChild(resumoDiv);

            let toggleBtn = document.createElement("button");
            toggleBtn.textContent = "👁️ Mostrar/Ocultar Mensagens";
            toggleBtn.className = "botao-enviar";
            toggleBtn.onclick = () => {
                mensagensDiv.style.display = mensagensDiv.style.display === "none" ? "block" : "none";
            };
            container.appendChild(toggleBtn);

            return; // Para evitar que processe mais mensagens após o encerramento
        }

        // Atualizar contadores
        if (data.status === "success") {
            statusContador.success++;
        } else if (data.status === "error") {
            statusContador.error++;
        } else {
            statusContador.pendente++;
        }

        // Definir o status correto para exibir no frontend
        let mensagemStatus = "⌛ Enviada"; // Status padrão (processando)
        let mensagemCor = "blue";

        if (data.status === "success") {
            mensagemStatus = "✅ Sucesso";
            mensagemCor = "green";
        } else if (data.status === "error") {
            mensagemStatus = "❌ Erro";
            mensagemCor = "red";
        }

        // Adicionar mensagem ao chat
        adicionarMensagem(data.mensagem_recebida, mensagemStatus, mensagemCor, data.timestamp, data.status === "enviado" ? "usuario" : "bot", arquivo_id);
    };

    ws.onclose = function () {
        console.log(`❌ Conexão WebSocket ${arquivo_id} encerrada.`);
    };
}


function adicionarMensagem(texto, statusIcon, cor, timestamp, tipo, arquivo_id) {
    let mensagensDiv = document.getElementById(`mensagens${arquivo_id}`);

    if (!mensagensDiv) {
        console.error(`❌ Elemento mensagens${arquivo_id} não encontrado.`);
        return;
    }

    let divMensagem = document.createElement("div");
    divMensagem.className = `mensagem ${tipo}`;

    let statusSpan = document.createElement("span");
    statusSpan.innerHTML = statusIcon;
    statusSpan.style.color = cor;
    statusSpan.className = "status";

    let textoFormatado = texto.replace(/\n/g, "<br>");

    divMensagem.innerHTML = `
        <p>${textoFormatado}</p>
        <span class="timestamp">${timestamp}</span>
    `;

    divMensagem.appendChild(statusSpan);
    mensagensDiv.appendChild(divMensagem);

    mensagensDiv.scrollTop = mensagensDiv.scrollHeight;
}


function enviarArquivo() {
    nome = document.getElementById("nome").value;
    telefoneBase = document.getElementById("telefone").value;

    if (!nome || !telefoneBase || isNaN(telefoneBase)) {
        Swal.fire({ icon: "error", title: "Erro", text: "Preencha Nome e Telefone corretamente." });
        return;
    }

    let fileInput = document.getElementById("arquivoExcel");
    let file = fileInput.files[0];

    if (!file) {
        Swal.fire({ icon: "warning", title: "Aviso", text: "Selecione um arquivo antes de enviar." });
        return;
    }

    let formData = new FormData();
    formData.append("file", file);
    formData.append("nome", nome);
    formData.append("telefone", telefoneBase);

    Swal.fire({ title: "Enviando...", allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    fetch("/qa/enviar-multi-teste", {
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        Swal.close();
        console.log("📩 Resposta da API:", data);
    
        let testesContainer = document.getElementById("testesContainer");
        testesContainer.innerHTML = "";
    
        // Iterar sobre cada planilha e seu arquivo_id correspondente
        for (let nome_planilha in data.planilhas) {
            let arquivo_id = data.planilhas[nome_planilha];
    
            let testeCard = document.createElement("div");
            testeCard.className = "teste-card";
            testeCard.id = `container${arquivo_id}`; // Criamos um ID para referência
    
            testeCard.innerHTML = `
                <h3>Caso de Teste: ${nome_planilha} - Id: ${arquivo_id}</h3> 
                <div id="mensagens${arquivo_id}" class="mensagens-container"></div>
            `;
    
            testesContainer.appendChild(testeCard);
            let encerrarBtn = document.createElement("button");
            encerrarBtn.textContent = "🛑 Encerrar Teste";
            encerrarBtn.className = "botao-encerrar";
            encerrarBtn.onclick = () => encerrarWebSocket(arquivo_id);
            container.appendChild(encerrarBtn);

            conectarWebSocket(arquivo_id); // Abre WebSocket para esse teste
        }
    
        Swal.fire({ icon: "success", title: "Testes iniciados!", timer: 2000, showConfirmButton: false });
    })
    .catch(error => {
        Swal.close();
        console.error("Erro ao iniciar testes:", error);
        Swal.fire({ icon: "error", title: "Erro", text: "Erro ao iniciar testes." });
    });    
}

function encerrarWebSocket(arquivo_id) {
    const ws = wsConnections[arquivo_id];
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        wsConnections[arquivo_id] = null;
        console.log(`🛑 WebSocket encerrado manualmente para ${arquivo_id}`);
        Swal.fire({
            icon: "info",
            title: "Conexão encerrada",
            text: `O teste com ID ${arquivo_id} foi encerrado manualmente.`
        });
    } else {
        console.warn(`⚠️ Nenhuma conexão ativa para ${arquivo_id}`);
    }
}
