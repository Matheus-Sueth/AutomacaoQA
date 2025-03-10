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
                <h4>Resumo do Teste:</h4>
                <p>✅ Sucesso: <strong>${statusContador.success}</strong></p>
                <p>❌ Erros: <strong>${statusContador.error}</strong></p>
                <p>⌛ Enviadas: <strong>${statusContador.pendente}</strong></p>
            `;

            let container = document.getElementById(`container${arquivo_id}`);
            container.appendChild(resumoDiv);

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
        let mensagemStatus = "⌛"; // Status padrão (processando)
        let mensagemCor = "blue";

        if (data.status === "success") {
            mensagemStatus = "✅";
            mensagemCor = "green";
        } else if (data.status === "error") {
            mensagemStatus = "❌";
            mensagemCor = "red";
        }

        // Adicionar mensagem ao chat
        adicionarMensagem(data.mensagem, mensagemStatus, mensagemCor, data.timestamp, data.status === "enviado" ? "usuario" : "bot", arquivo_id);
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
        alert("Preencha Nome e Telefone corretamente.");
        return;
    }

    let fileInput = document.getElementById("arquivoExcel");
    let file = fileInput.files[0];

    if (!file) {
        alert("Selecione um arquivo antes de enviar.");
        return;
    }

    let formData = new FormData();
    formData.append("file", file);
    formData.append("nome", nome);
    formData.append("telefone", telefoneBase);

    fetch("/enviar-multi-teste", {
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(data => {
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
                <h3>Teste: ${nome_planilha} ${arquivo_id}</h3> 
                <div id="mensagens${arquivo_id}" class="mensagens-container"></div>
            `;
    
            testesContainer.appendChild(testeCard);
    
            conectarWebSocket(arquivo_id); // Abre WebSocket para esse teste
        }
    
        alert("Testes iniciados! Aguarde as notificações.");
    })
    .catch(error => {
        console.error("Erro ao iniciar testes:", error);
        alert("Erro ao iniciar testes.");
    });    
}
