function conectarWebSocket(arquivo_id) {
    let protocolo = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    let wsUrl = `${protocolo}://${host}/ws/notificacoes/${arquivo_id}`;

    console.log("📡 Conectando ao WebSocket (automático):", wsUrl);
    let ws = new WebSocket(wsUrl);
    wsConnections[arquivo_id] = ws;

    let statusContador = { success: 0, error: 0, pendente: 0 };

    ws.onmessage = function (event) {
        let data = JSON.parse(event.data);
        console.log(`📩 [Automático] Mensagem recebida para ${arquivo_id}:`, data);

        if (data.status === "end") {
            ws.close();
            wsConnections[arquivo_id] = null;
            let mensagensDiv = document.getElementById(`mensagens${arquivo_id}`);
            mensagensDiv.style.display = "none";

            let resumoDiv = document.createElement("div");
            resumoDiv.className = "resumo-teste";
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

            return;
        }

        if (data.status === "success") statusContador.success++;
        else if (data.status === "error") statusContador.error++;
        else statusContador.pendente++;

        let mensagemStatus = "⌛ Enviada";
        let mensagemCor = "blue";
        if (data.status === "success") {
            mensagemStatus = "✅ Sucesso"; mensagemCor = "green";
        } else if (data.status === "error") {
            mensagemStatus = "❌ Erro"; mensagemCor = "red";
        }

        adicionarMensagem(data.mensagem_recebida, mensagemStatus, mensagemCor, data.timestamp, data.status === "enviado" ? "usuario" : "bot", arquivo_id);
    };

    ws.onclose = function () {
        console.log(`❌ Conexão WebSocket automática encerrada para ${arquivo_id}`);
    };
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
            arquivosIds.push(arquivo_id);
    
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
            testeCard.appendChild(encerrarBtn);

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
