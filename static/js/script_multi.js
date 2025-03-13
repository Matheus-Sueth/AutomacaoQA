let arquivosIds = [];
let nome, telefoneBase;
let wsConnections = {};

function mostrarNotificacao(mensagem, icone) {
    Swal.fire({
        title: mensagem,
        icon: icone,
        timer: 2000,
        toast: true,
        position: "top-end",
        showConfirmButton: false
    });
}

function conectarWebSocket(arquivo_id) {
    if (wsConnections[arquivo_id]) {
        console.log(`❌ Fechando WebSocket para ${arquivo_id}`);
        wsConnections[arquivo_id].close();
        wsConnections[arquivo_id] = null;
        return;
    }

    let protocolo = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    let wsUrl = `${protocolo}://${host}/ws/notificacao/${arquivo_id}`;

    console.log("📡 Conectando ao WebSocket:", wsUrl);

    let ws = new WebSocket(wsUrl);
    wsConnections[arquivo_id] = ws;

    let statusContador = { success: 0, error: 0, pendente: 0, silencio: 0 };

    ws.onmessage = function (event) {
        let data = JSON.parse(event.data);
        console.log(`📩 Mensagem recebida para ${arquivo_id}:`, data);

        if (data.status === "end") {
            console.log(`✅ Testes finalizados para ${arquivo_id}. Fechando WebSocket.`);
            ws.close();
            wsConnections[arquivo_id] = null;

            let mensagensDiv = document.getElementById(`mensagens${arquivo_id}`);
            mensagensDiv.style.display = "none";

            let resumoDiv = document.createElement("div");
            resumoDiv.className = "resumo-teste";
            resumoDiv.innerHTML = `
                <h4>Resumo do Teste:</h4>
                <p>✅ Sucesso: <strong>${statusContador.success}</strong></p>
                <p>❌ Erros: <strong>${statusContador.error}</strong></p>
                <p>📤 Enviadas: <strong>${statusContador.pendente}</strong></p>
                <p>⌛ Silêncio: <strong>${statusContador.silencio}</strong></p>
            `;

            let container = document.getElementById(`container${arquivo_id}`);
            container.appendChild(resumoDiv);

            return;
        }

        if (data.status === "success") statusContador.success++;
        else if (data.status === "error") statusContador.error++;
        else if (data.status === "await") statusContador.silencio++;
        else statusContador.pendente++;

        let mensagemStatus = "📤";
        let mensagemCor = "blue";

        if (data.status === "success") {
            mensagemStatus = "✅";
            mensagemCor = "green";
        } else if (data.status === "error") {
            mensagemStatus = "❌";
            mensagemCor = "red";
        } else if (data.status === "await") {
            mensagemStatus = "⌛";
            mensagemCor = "yellow";
        }

        adicionarMensagem(data.mensagem, mensagemStatus, mensagemCor, data.timestamp, data.tipo, arquivo_id);
    };

    ws.onclose = function () {
        console.log(`❌ Conexão WebSocket ${arquivo_id} encerrada.`);
        wsConnections[arquivo_id] = null;
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

function carregarTestes() {
    nome = document.getElementById("nome").value;
    telefoneBase = document.getElementById("telefone").value;

    if (!nome || !telefoneBase || isNaN(telefoneBase)) {
        mostrarNotificacao("Preencha Nome e Telefone corretamente.", "error");
        return;
    }

    let fileInput = document.getElementById("arquivoExcel");
    let file = fileInput.files[0];

    if (!file) {
        mostrarNotificacao("Selecione um arquivo antes de enviar.", "error");
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

        for (let nome_planilha in data.planilhas) {
            let arquivo_id = data.planilhas[nome_planilha];

            let testeCard = document.createElement("div");
            testeCard.className = "teste-card";
            testeCard.id = `container${arquivo_id}`;

            testeCard.innerHTML = `
                <h3>Teste: ${nome_planilha} ${arquivo_id}</h3> 
                <div id="mensagens${arquivo_id}" class="mensagens-container"></div>
            `;

            testesContainer.appendChild(testeCard);

            // Conectar WebSocket automaticamente
            conectarWebSocket(arquivo_id);
        }

        let botaoPararTodos = document.createElement("button");
        botaoPararTodos.className = "botao-parar-todos";
        botaoPararTodos.textContent = "🛑 Parar Todos os Testes";
        botaoPararTodos.onclick = () => {
            for (let id in wsConnections) {
                if (wsConnections[id]) {
                    wsConnections[id].close();
                    wsConnections[id] = null;
                }
            }
        };

        testesContainer.appendChild(botaoPararTodos);

        mostrarNotificacao("Testes Iniciados!", "success");
    })
    .catch(error => {
        console.error("Erro ao carregar testes:", error);
        mostrarNotificacao("Erro ao iniciar testes. Tente novamente.", "error");
    });
}