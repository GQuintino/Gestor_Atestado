let atestados = [];
let atestadoParaRecusar = null;
let atestadoParaEncaminhar = null;
let atestadosFiltrados = [];

document.addEventListener('DOMContentLoaded', function() {
    carregarEstatisticas();
    carregarAtestados();
    
    // Atualizar a cada 30 segundos
    setInterval(() => {
        carregarEstatisticas();
        carregarAtestados();
    }, 30000);
});

async function carregarEstatisticas() {
    try {
        const response = await fetch('/api/estatisticas');
        const estatisticas = await response.json();
        
        document.getElementById('totalAtestados').textContent = estatisticas.total;
        document.getElementById('pendentesAtestados').textContent = estatisticas.pendentes;
        document.getElementById('aprovadosAtestados').textContent = estatisticas.aprovados;
        document.getElementById('recusadosAtestados').textContent = estatisticas.recusados;
        document.getElementById('invalidadosAtestados').textContent = estatisticas.invalidados || 0;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

async function carregarAtestados() {
    try {
        const response = await fetch('/api/atestados');
        atestados = await response.json();
        filtrarAtestados();
    } catch (error) {
        console.error('Erro ao carregar atestados:', error);
        document.getElementById('listaAtestados').innerHTML = 
            '<div class="loading">Erro ao carregar atestados</div>';
    }
}

function filtrarAtestados() {
    const filtroStatus = document.getElementById('filtroStatus').value;
    const buscaNome = document.getElementById('buscaNome').value.toLowerCase();
    
    atestadosFiltrados = atestados.filter(atestado => {
        const statusMatch = filtroStatus === 'todos' || atestado.status === filtroStatus;
        const nomeMatch = atestado.nomeFuncionario.toLowerCase().includes(buscaNome);
        return statusMatch && nomeMatch;
    });
    
    renderizarAtestados();
}

function renderizarAtestados() {
    const container = document.getElementById('listaAtestados');
    
    if (atestadosFiltrados.length === 0) {
        container.innerHTML = '<div class="loading">Nenhum atestado encontrado</div>';
        return;
    }
    
    container.innerHTML = atestadosFiltrados.map(atestado => `
        <div class="atestado-item ${atestado.status} ${!atestado.valido ? 'invalido' : ''}">
            <div class="atestado-header">
                <div class="atestado-info">
                    <h3>${atestado.nomeFuncionario}</h3>
                    <span class="status-badge status-${atestado.status}">
                        ${getStatusText(atestado.status)}
                    </span>
                    ${!atestado.valido ? '<span class="status-badge status-invalido">Inválido</span>' : ''}
                </div>
            </div>
            <div class="atestado-meta">
                <div class="meta-item">
                    <span class="meta-label">Período</span>
                    <span class="meta-value">${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Data Emissão</span>
                    <span class="meta-value">${formatarData(atestado.dataEmissao)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Médico</span>
                    <span class="meta-value">${atestado.nomeMedico} - CRM: ${atestado.crmMedico}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Coordenador</span>
                    <span class="meta-value">${atestado.coordenador}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">E-mail</span>
                    <span class="meta-value">${atestado.email}</span>
                </div>
                ${atestado.motivoRecusa ? `
                <div class="meta-item">
                    <span class="meta-label">Motivo Recusa</span>
                    <span class="meta-value">${atestado.motivoRecusa}</span>
                </div>
                ` : ''}
                ${atestado.encaminhadoPara ? `
                <div class="meta-item">
                    <span class="meta-label">Encaminhado para</span>
                    <span class="meta-value">${Array.isArray(atestado.encaminhadoPara) ? atestado.encaminhadoPara.join(', ') : atestado.encaminhadoPara}</span>
                </div>
                ` : ''}
            </div>
            <div class="atestado-actions">
                <button onclick="visualizarArquivo(${atestado.id})" class="btn btn-visualizar">
                    Visualizar Atestado
                </button>
                ${atestado.status === 'pendente' && atestado.valido ? `
                <button onclick="aprovarAtestado(${atestado.id})" class="btn btn-aprovar">
                    Aprovar
                </button>
                <button onclick="abrirModalRecusar(${atestado.id})" class="btn btn-recusar">
                    Recusar
                </button>
                <button onclick="abrirModalEncaminhar(${atestado.id})" class="btn btn-encaminhar">
                    Encaminhar
                </button>
                ` : ''}
                <button onclick="downloadArquivo(${atestado.id})" class="btn btn-download">
                    Download
                </button>
            </div>
            <div class="atestado-footer">
                <small>Enviado em: ${formatarDataHora(atestado.dataEnvio)}</small>
                ${atestado.dataValidacao ? `
                <small> | Validado em: ${formatarDataHora(atestado.dataValidacao)}</small>
                ` : ''}
                ${atestado.dataEncaminhamento ? `
                <small> | Encaminhado em: ${formatarDataHora(atestado.dataEncaminhamento)}</small>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function getStatusText(status) {
    const statusMap = {
        'pendente': 'Pendente',
        'aprovado': 'Aprovado',
        'recusado': 'Recusado'
    };
    return statusMap[status] || status;
}

function formatarData(data) {
    return new Date(data).toLocaleDateString('pt-BR');
}

function formatarDataHora(data) {
    return new Date(data).toLocaleString('pt-BR');
}

async function visualizarArquivo(id) {
    const atestado = atestados.find(a => a.id === id);
    if (!atestado) return;
    
    const visualizador = document.getElementById('visualizadorArquivo');
    const modal = document.getElementById('modalArquivo');
    
    visualizador.innerHTML = '<p>Carregando arquivo...</p>';
    modal.style.display = 'flex';
    
    try {
        const response = await fetch(`/api/atestados/${id}/arquivo`);
        if (!response.ok) throw new Error('Arquivo não encontrado');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (blob.type === 'application/pdf') {
            visualizador.innerHTML = `
                <iframe src="${url}" width="100%" height="400px"></iframe>
            `;
        } else if (blob.type.startsWith('image/')) {
            visualizador.innerHTML = `
                <img src="${url}" alt="Atestado médico" style="max-width: 100%; max-height: 400px;">
            `;
        } else {
            visualizador.innerHTML = '<p>Visualização não disponível para este tipo de arquivo</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar arquivo:', error);
        visualizador.innerHTML = '<p>Erro ao carregar arquivo</p>';
    }
}

function fecharModalArquivo() {
    document.getElementById('modalArquivo').style.display = 'none';
}

async function downloadArquivo(id) {
    const atestado = atestados.find(a => a.id === id);
    if (!atestado) return;
    
    try {
        const response = await fetch(`/api/atestados/${id}/arquivo`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `atestado-${atestado.nomeFuncionario}-${atestado.dataInicio}${getFileExtension(atestado.arquivo)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Erro ao fazer download:', error);
        mostrarMensagem('Erro ao fazer download do arquivo', 'erro');
    }
}

function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
}

async function aprovarAtestado(id) {
    if (!confirm('Tem certeza que deseja aprovar este atestado?')) return;
    
    try {
        const response = await fetch(`/api/atestados/${id}/aprovar`, {
            method: 'POST'
        });
        
        if (response.ok) {
            await carregarAtestados();
            await carregarEstatisticas();
            mostrarMensagem('Atestado aprovado com sucesso!', 'sucesso');
        } else {
            mostrarMensagem('Erro ao aprovar atestado', 'erro');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem('Erro ao aprovar atestado', 'erro');
    }
}

function abrirModalRecusar(id) {
    atestadoParaRecusar = id;
    document.getElementById('modalRecusar').style.display = 'flex';
    document.getElementById('motivoRecusa').value = '';
}

function fecharModal() {
    document.getElementById('modalRecusar').style.display = 'none';
    atestadoParaRecusar = null;
}

async function confirmarRecusa() {
    const motivo = document.getElementById('motivoRecusa').value.trim();
    
    if (!motivo) {
        alert('Por favor, informe o motivo da recusa');
        return;
    }
    
    try {
        const response = await fetch(`/api/atestados/${atestadoParaRecusar}/recusar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ motivo })
        });
        
        if (response.ok) {
            fecharModal();
            await carregarAtestados();
            await carregarEstatisticas();
            mostrarMensagem('Atestado recusado com sucesso!', 'sucesso');
        } else {
            const error = await response.json();
            mostrarMensagem(error.error || 'Erro ao recusar atestado', 'erro');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem('Erro ao recusar atestado', 'erro');
    }
}

function abrirModalEncaminhar(id) {
    atestadoParaEncaminhar = id;
    document.getElementById('emailsGestores').value = '';
    document.getElementById('mensagemGestor').value = '';
    document.getElementById('modalEncaminhar').style.display = 'flex';
}

function fecharModalEncaminhar() {
    document.getElementById('modalEncaminhar').style.display = 'none';
    atestadoParaEncaminhar = null;
}

async function confirmarEncaminhamento() {
    const emailsInput = document.getElementById('emailsGestores').value.trim();
    const mensagem = document.getElementById('mensagemGestor').value.trim();
    
    if (!emailsInput) {
        alert('Por favor, informe pelo menos um email');
        return;
    }
    
    // Separar emails por vírgula e validar
    const emails = emailsInput.split(',').map(email => email.trim()).filter(email => email);
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailsInvalidos = emails.filter(email => !emailRegex.test(email));
    
    if (emailsInvalidos.length > 0) {
        alert(`Emails inválidos: ${emailsInvalidos.join(', ')}`);
        return;
    }
    
    try {
        const response = await fetch(`/api/atestados/${atestadoParaEncaminhar}/encaminhar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                emails, 
                mensagem 
            })
        });
        
        if (response.ok) {
            fecharModalEncaminhar();
            await carregarAtestados();
            mostrarMensagem('Atestado encaminhado com sucesso!', 'sucesso');
        } else {
            const error = await response.json();
            mostrarMensagem(error.error || 'Erro ao encaminhar atestado', 'erro');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem('Erro ao encaminhar atestado', 'erro');
    }
}

function sair() {
    if (confirm('Deseja sair do painel administrativo?')) {
        window.location.href = '/';
    }
}

function mostrarMensagem(texto, tipo) {
    // Remove mensagem anterior se existir
    const mensagemAnterior = document.querySelector('.mensagem-flutuante');
    if (mensagemAnterior) {
        mensagemAnterior.remove();
    }
    
    const mensagem = document.createElement('div');
    mensagem.className = `mensagem-flutuante ${tipo}`;
    mensagem.textContent = texto;
    
    document.body.appendChild(mensagem);
    
    // Remove a mensagem após 5 segundos
    setTimeout(() => {
        mensagem.remove();
    }, 5000);
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modalRecusar = document.getElementById('modalRecusar');
    const modalArquivo = document.getElementById('modalArquivo');
    const modalEncaminhar = document.getElementById('modalEncaminhar');
    
    if (event.target === modalRecusar) {
        fecharModal();
    }
    if (event.target === modalArquivo) {
        fecharModalArquivo();
    }
    if (event.target === modalEncaminhar) {
        fecharModalEncaminhar();
    }
}

// Fechar modal com ESC
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        fecharModal();
        fecharModalArquivo();
        fecharModalEncaminhar();
    }
});