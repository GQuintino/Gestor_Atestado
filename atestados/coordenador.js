let coordenadorToken = null; // Guarda o token de acesso da URL
let atestadoParaRecusar = null; // Guarda o ID do atestado a ser recusado

document.addEventListener('DOMContentLoaded', async function() {
    coordenadorToken = obterTokenDaURL();
    
    if (!coordenadorToken) {
        document.getElementById('loading').textContent = 'ERRO: Link de acesso inválido ou token não encontrado.';
        document.getElementById('loading').className = 'mensagem erro';
        return;
    }
    
    await carregarInfoCoordenador();
    carregarListasAtestados();
});

// Extrai o token da URL
function obterTokenDaURL() {
    try {
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1]; 
    } catch (e) {
        return null;
    }
}

// Busca o nome do coordenador
async function carregarInfoCoordenador() {
    if (!coordenadorToken) return;
    try {
        const response = await fetch(`/atestados/api/coordenador/${coordenadorToken}/info`);
        if (!response.ok) throw new Error('Não foi possível verificar os dados do coordenador.');
        const coordInfo = await response.json();
        document.getElementById('coordNome').textContent = coordInfo.nome;
    } catch (error) {
        document.getElementById('coordNome').textContent = '(Coordenador)';
        console.error("Erro ao buscar info do coordenador:", error.message);
    }
}

// NOVO: Busca e renderiza todas as listas
async function carregarListasAtestados() {
    if (!coordenadorToken) return;
    
    document.getElementById('loading').style.display = 'block';
    
    try {
        // 1. Chamar a nova Rota
        const response = await fetch(`/atestados/api/coordenador/${coordenadorToken}/meus-atestados`);
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Erro ao carregar atestados.');
        }
        
        const atestados = await response.json();
        
        // 2. Separar os atestados em listas
        const pendentes = atestados.filter(a => a.status === 'pendente_coordenador');
        const aprovados = atestados.filter(a => a.status !== 'pendente_coordenador' && a.status !== 'recusado');
        const recusados = atestados.filter(a => a.status === 'recusado' && a.nomeCoordenadorValidador); // Apenas os recusados pelo coordenador

        // 3. Renderizar cada lista
        renderizarLista('lista-pendentes', pendentes, 'pendente');
        renderizarLista('lista-aprovados', aprovados, 'aprovado');
        renderizarLista('lista-recusados', recusados, 'recusado');

        document.getElementById('loading').style.display = 'none';
        
    } catch (error) {
        document.getElementById('loading').textContent = `Erro ao carregar listas: ${error.message}`;
        document.getElementById('loading').className = 'mensagem erro';
    }
}

// NOVO: Função para renderizar o HTML de uma lista
function renderizarLista(elementId, lista, tipo) {
    const container = document.getElementById(elementId);
    
    if (lista.length === 0) {
        container.innerHTML = '<p style="padding: 10px; font-size: 14px; color: #777;">Nenhum atestado nesta categoria.</p>';
        return;
    }
    
    container.innerHTML = lista.map(atestado => {
        // Define os botões com base no tipo de lista
        let botoes = '';
        if (tipo === 'pendente') {
            botoes = `
                <button onclick="aprovarAtestado(${atestado.id})" class="btn btn-aprovar">Aprovar</button>
                <button onclick="abrirModalRecusar(${atestado.id})" class="btn btn-recusar">Recusar</button>
            `;
        }
        
        // Define o detalhe do status para listas de histórico
        let statusDetalhe = '';
        if (tipo === 'recusado') {
            statusDetalhe = `
            <div class="meta-item">
                <span class="meta-label">Motivo da Recusa</span>
                <span class="meta-value">${atestado.motivoRecusaCoordenador || 'N/A'}</span>
            </div>`;
        }
        if (tipo === 'aprovado') {
            statusDetalhe = `
            <div class="meta-item">
                <span class="meta-label">Status RH</span>
                <span class="meta-value">${atestado.status === 'aprovado' ? 'Aprovado Final' : 'Aguardando RH'}</span>
            </div>`;
        }

        return `
        <div class="atestado-item ${atestado.status}">
            <div class="atestado-info">
                <h3>${atestado.nomeFuncionario}</h3>
            </div>
            <div class="atestado-meta">
                <div class="meta-item">
                    <span class="meta-label">Enviado</span>
                    <span class="meta-value">${formatarData(atestado.dataEnvio)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Período</span>
                    <span class="meta-value">${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)} (${atestado.diasAfastamento || 'N/A'}d)</span>
                </div>
                ${statusDetalhe}
            </div>
            <div class="atestado-actions" style="margin-top: 10px;">
                <button onclick="visualizarArquivo(${atestado.id})" class="btn btn-visualizar">Visualizar</button>
                ${botoes}
            </div>
        </div>
        `;
    }).join('');
}

// NOVO: Ação de aprovar (separada)
async function aprovarAtestado(id) {
    if (!coordenadorToken) return;
    if (!confirm('Tem certeza que deseja APROVAR este atestado e enviá-lo ao RH?')) return;

    const url = `/atestados/api/coordenador/${coordenadorToken}/atestados/${id}/aprovar`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const result = await response.json();
        if (response.ok) {
            alert(result.message || 'Aprovado com sucesso!');
            carregarListasAtestados(); // Recarrega as listas
        } else {
            throw new Error(result.error || 'Erro ao aprovar');
        }
    } catch (error) {
        alert(`Erro: ${error.message}`);
    }
}

// NOVO: Ação de recusar (separada)
async function confirmarRecusa() {
    if (!atestadoParaRecusar || !coordenadorToken) return;

    const motivo = document.getElementById('motivoRecusa').value.trim();
    if (!motivo) {
        alert('O motivo da recusa é obrigatório.');
        return;
    }
    
    const url = `/atestados/api/coordenador/${coordenadorToken}/atestados/${atestadoParaRecusar}/recusar`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message || 'Recusado com sucesso!');
            fecharModalRecusar();
            carregarListasAtestados(); // Recarrega as listas
        } else {
            throw new Error(result.error || 'Erro ao recusar');
        }
    } catch (error) {
         alert(`Erro: ${error.message}`);
    }
}


// --- Funções de Modal ---

function abrirModalRecusar(id) {
    atestadoParaRecusar = id;
    document.getElementById('motivoRecusa').value = '';
    document.getElementById('modalRecusar').style.display = 'flex';
}

function fecharModalRecusar() {
    document.getElementById('modalRecusar').style.display = 'none';
    atestadoParaRecusar = null;
}

// MODIFICADO: Visualizar arquivo (com aviso de loading)
async function visualizarArquivo(id) {
    if (!id) return;
    
    const visualizador = document.getElementById('visualizadorArquivo');
    const modal = document.getElementById('modalArquivo');
    const avisoLoading = document.getElementById('aviso-pdf-loading');
    
    visualizador.innerHTML = '<p>A carregar...</p>';
    avisoLoading.style.display = 'flex'; // Mostra o aviso
    modal.style.display = 'flex';
    
    try {
        const response = await fetch(`/atestados/api/atestados/${id}/arquivo`);
        if (!response.ok) throw new Error('Arquivo não encontrado');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (blob.type === 'application/pdf') {
            visualizador.innerHTML = `<iframe src="${url}" width="100%" height="500px"></iframe>`;
        } else if (blob.type.startsWith('image/')) {
            visualizador.innerHTML = `<img src="${url}" alt="Atestado" style="max-width: 100%; max-height: 500px;">`;
        } else {
            visualizador.innerHTML = '<p>Visualização não disponível</p>';
        }
    } catch (error) {
        visualizador.innerHTML = '<p>Erro ao carregar arquivo</p>';
    } finally {
        avisoLoading.style.display = 'none'; // Esconde o aviso após carregar
    }
}

function fecharModalArquivo() {
    document.getElementById('modalArquivo').style.display = 'none';
    document.getElementById('visualizadorArquivo').innerHTML = '';
}

// --- Funções Utilitárias ---

function formatarData(data) {
    if (!data) return 'N/A';
    try {
        const dataObj = new Date(data);
        return dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch (e) { return 'Data Inválida'; }
}

// Fechar modals ao clicar fora
window.onclick = function(event) {
    const modalArquivo = document.getElementById('modalArquivo');
    const modalRecusar = document.getElementById('modalRecusar');
    if (event.target === modalArquivo) {
        fecharModalArquivo();
    }
    if (event.target === modalRecusar) {
        fecharModalRecusar();
    }
}