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


function conectarWebSocket(arquivo_id, botao) {
    if (wsConnections[arquivo_id]) {
        console.log(`❌ Fechando WebSocket para ${arquivo_id}`);
        wsConnections[arquivo_id].close();
        wsConnections[arquivo_id] = null;
        botao.textContent = "▶️ Iniciar Teste";
        return;
    }

    let protocolo = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    let wsUrl = `${protocolo}://${host}/ws/notificacao/${arquivo_id}`;

    console.log("📡 Conectando ao WebSocket:", wsUrl);

    let ws = new WebSocket(wsUrl);
    wsConnections[arquivo_id] = ws;

    // Contadores de status
    let statusContador = {
        success: 0,
        error: 0,
        pendente: 0,
        silencio: 0
    };

    ws.onmessage = function (event) {
        let data = JSON.parse(event.data);
        console.log(`📩 Mensagem recebida para ${arquivo_id}:`, data);

        // Caso receba o status "end", finaliza o teste
        if (data.status === "end") {
            finalizarConexao = true;
            console.log(`✅ Testes finalizados para ${arquivo_id}. Fechando WebSocket.`);
            ws.close();
            wsConnections[arquivo_id] = null;
            botao.textContent = "▶️ Iniciar Teste";

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
                <p>📤 Enviadas: <strong>${statusContador.pendente}</strong></p>
                <p>⌛ Silêncio: <strong>${statusContador.silencio}</strong></p>
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
        } else if (data.status === "await") {
            statusContador.silencio++;
        } else {
            statusContador.pendente++;
        }

        // Definir o status correto para exibir no frontend
        let mensagemStatus = "📤"; // Status padrão (processando)
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

        // Adicionar mensagem ao chat
        adicionarMensagem(data.mensagem, mensagemStatus, mensagemCor, data.timestamp, data.tipo, arquivo_id);
    };

    ws.onclose = function () {
        console.log(`❌ Conexão WebSocket ${arquivo_id} encerrada.`);
        wsConnections[arquivo_id] = null;
        botao.textContent = "▶️ Iniciar Teste";
    };

    botao.textContent = "⏹ Parar Teste";
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
    
        // Iterar sobre cada planilha e seu arquivo_id correspondente
        for (let nome_planilha in data.planilhas) {
            let arquivo_id = data.planilhas[nome_planilha];
    
            let testeCard = document.createElement("div");
            testeCard.className = "teste-card";
            testeCard.id = `container${arquivo_id}`; // Criamos um ID para referência

            let botaoIniciar = document.createElement("button");
            botaoIniciar.className = "botao-iniciar";
            botaoIniciar.textContent = "▶️ Iniciar Teste";
            botaoIniciar.onclick = () => conectarWebSocket(arquivo_id, botaoIniciar);
    
            testeCard.innerHTML = `
                <h3>Teste: ${nome_planilha} ${arquivo_id}</h3> 
                <div id="mensagens${arquivo_id}" class="mensagens-container"></div>
            `;
            testeCard.appendChild(botaoIniciar);
            testesContainer.appendChild(testeCard);
        }
    
        Swal.fire({
            title: "Testes Carregados!",
            text: "Clique em 'Iniciar Teste' para começar.",
            icon: "success",
            timer: 3000,
            toast: true,
            position: "top-end",
            showConfirmButton: false
        });
    })
    .catch(error => {
        console.error("Erro ao carregar testes:", error);
        Swal.fire("Erro ao carregar testes", "Tente novamente", "error");
    });    
}
