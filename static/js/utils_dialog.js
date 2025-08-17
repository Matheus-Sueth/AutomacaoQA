// /static/js/utils_dialog.js
(function (global) {
    if (!global) return;

    // ---------- Helpers ----------
    const q = (s, r=document) => r.querySelector(s);
    const qa = (s, r=document) => Array.from(r.querySelectorAll(s));
    const onlyDigits = (n) => (n ?? "").replace(/\D/g, "");
    const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
    const notAllEqual = (arr) => arr.some(d => d !== arr[0]);

    // CPF
    const maskCPF = (d) => onlyDigits(d).replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, "$1.$2.$3-$4");
    function cpfDigits(){
        let n = Array.from({length:9}, () => rand(0,9));
        while(!notAllEqual(n)) n = Array.from({length:9}, () => rand(0,9));
        let s = n.reduce((a,d,i)=>a + d*(10-i),0);
        let d1 = 11 - (s % 11); d1 = d1 > 9 ? 0 : d1;
        s = [...n,d1].reduce((a,d,i)=>a + d*(11-i),0);
        let d2 = 11 - (s % 11); d2 = d2 > 9 ? 0 : d2;
        return [...n,d1,d2].join("");
    }
    function gerarCPF(mask=true){ const d=cpfDigits(); return mask ? maskCPF(d) : d; }

    // CNPJ
    const maskCNPJ = (d) => onlyDigits(d).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5");
    function cnpjDigits(){
        let n = Array.from({length:12}, () => rand(0,9));
        while(!notAllEqual(n)) n = Array.from({length:12}, () => rand(0,9));
        const m1=[5,4,3,2,9,8,7,6,5,4,3,2], m2=[6,5,4,3,2,9,8,7,6,5,4,3,2];
        let s = n.reduce((a,d,i)=>a + d*m1[i],0);
        let d1 = s % 11; d1 = d1 < 2 ? 0 : 11 - d1;
        s = [...n,d1].reduce((a,d,i)=>a + d*m2[i],0);
        let d2 = s % 11; d2 = d2 < 2 ? 0 : 11 - d2;
        return [...n,d1,d2].join("");
    }
    function gerarCNPJ(mask=true){ const d=cnpjDigits(); return mask ? maskCNPJ(d) : d; }

    // Clipboard com fallback
    async function copiarTexto(txt){
    try{
        await navigator.clipboard.writeText(txt);
        toast("Copiado!", "success");
    }catch{
        const ta=document.createElement("textarea");
        ta.value=txt; ta.style.position="fixed"; ta.style.top="-1000px"; ta.style.opacity="0";
        document.body.appendChild(ta);
        ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
        document.execCommand && document.execCommand("copy");
        document.body.removeChild(ta);
        toast("Copiado!", "success");
    }
    }

    // Toast
    function toast(title, icon="info"){
    if (global.Swal) Swal.fire({ title, icon, timer: 1200, showConfirmButton:false, toast:true, position:"top-end" });
    else console.log(`[${icon}] ${title}`);
    }

    // ---------- UI ----------
    function buildHtml(){
    return `
        <div class="utilsdlg-wrap">
        <div class="utilsdlg-row">
            <div class="utilsdlg-seg" role="group" aria-label="Tipo de documento">
            <label>
                <input type="radio" name="dlgDocType" value="cpf" checked />
                <span>CPF</span>
            </label>
            <label>
                <input type="radio" name="dlgDocType" value="cnpj" />
                <span>CNPJ</span>
            </label>
            </div>

            <label class="utilsdlg-check">
            <input type="checkbox" id="dlgDocPunct" checked />
            <span>Com pontuação</span>
            </label>
        </div>

        <div class="utilsdlg-row">
            <input type="text" id="dlgDocValue" class="utilsdlg-input" readonly placeholder="Gerando…" />
        </div>

        <div class="utilsdlg-actions">
            <button type="button" class="botao-enviar" data-act="regen">Gerar novo</button>
            <button type="button" class="botao-enviar btn-secondary" data-act="copy">Copiar</button>
        </div>
        </div>
    `;
    }

    function generateValue(isCnpj, masked){
    return isCnpj ? gerarCNPJ(masked) : gerarCPF(masked);
    }

    function open(){
    if (!global.Swal) {
        console.error("SweetAlert2 não encontrado.");
        return;
    }

    Swal.fire({
        title: "Utilidades",
        html: buildHtml(),
        width: 560,
        showConfirmButton: false,
        showCloseButton: true,      // “X” no canto
        allowOutsideClick: true,    // pode fechar clicando fora
        didOpen: (popup) => {
            const $val  = q("#dlgDocValue", popup);
            const $mask = q("#dlgDocPunct",  popup);
            const getType = () => q('input[name="dlgDocType"]:checked', popup)?.value || "cpf";

            // Estado atual do diálogo
            const state = {
                type: getType(),          // "cpf" | "cnpj"
                digits: null              // string com somente dígitos
            };

            // Renderiza no input, aplicando/retirando máscara conforme checkbox
            const render = () => {
                const masked = !!$mask.checked;
                const out = (state.type === "cnpj")
                ? (masked ? maskCNPJ(state.digits) : state.digits)
                : (masked ? maskCPF(state.digits)  : state.digits);
                $val.value = out;
            };

            // Gera novos dígitos para o tipo atual
            const regenDigits = () => {
                state.digits = (state.type === "cnpj") ? cnpjDigits() : cpfDigits();
                render();
            };

            // Primeira geração
            regenDigits();

            // Trocar tipo => gera NOVOS dígitos desse tipo
            qa('input[name="dlgDocType"]', popup).forEach(r => {
                r.addEventListener("change", () => {
                state.type = getType();
                regenDigits();
                });
            });

            // Alternar "Com máscara" => NÃO regenera, só formata o número atual
            $mask.addEventListener("change", render);

            // Ações dos botões
            popup.addEventListener("click", async (e) => {
                const btn = e.target.closest("[data-act]");
                if (!btn) return;
                const act = btn.getAttribute("data-act");
                if (act === "regen") {
                regenDigits();                 // gera novos dígitos
                } else if (act === "copy") {
                await copiarTexto($val.value); // copia o valor exibido (mascarado ou não)
                }
            });
        }

    });
    }

    function attach(selector=".utilsdlg-btn"){
    qa(selector).forEach(btn => {
        if (btn.dataset.utilsdlgBound === "1") return;
        btn.dataset.utilsdlgBound = "1";
        btn.addEventListener("click", open);
    });
    }

    // API pública
    global.UtilsDialog = { open, attach };

})(window);
