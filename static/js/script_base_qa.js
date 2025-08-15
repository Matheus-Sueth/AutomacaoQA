// Funções reutilizáveis base
let wsConnections = {};
let arquivosIds = [];

function adicionarMensagem(texto, statusIcon, cor, timestamp, tipo, arquivo_id) {
    let mensagensDiv = document.getElementById(`mensagens${arquivo_id}`);
    if (!mensagensDiv) return;

    let divMensagem = document.createElement("div");
    divMensagem.className = `mensagem ${tipo}`;
    let statusSpan = document.createElement("span");
    statusSpan.innerHTML = statusIcon;
    statusSpan.style.color = cor;
    statusSpan.className = "status";

    let textoFormatado = texto.replace(/\\n|\n/g, "<br>");
    divMensagem.innerHTML = `<p>${textoFormatado}</p><span class="timestamp">${timestamp}</span>`;
    divMensagem.appendChild(statusSpan);
    mensagensDiv.appendChild(divMensagem);
    mensagensDiv.scrollTop = mensagensDiv.scrollHeight;
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
            timer: 1000,
            text: `O teste com ID ${arquivo_id} foi encerrado manualmente.`
        });

        // Alterna botão para "Ativar"
        const botao = document.querySelector(`#container${arquivo_id} .botao-encerrar`);
        if (botao) {
            botao.textContent = "🟢 Ativar";
            botao.onclick = () => conectarWebSocket(arquivo_id);
            botao.classList.remove("botao-encerrar");
            botao.classList.add("botao-ativar");
        }
    } else {
        console.warn(`⚠️ Nenhuma conexão ativa para ${arquivo_id}`);
    }
}

function encerrarTodosWebSockets() {
    for (let arquivo_id of arquivosIds) {
        encerrarWebSocket(arquivo_id);
    }
}