document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formAtestado');
    const mensagem = document.getElementById('mensagem');
    const btnSubmit = form.querySelector('.btn-submit');
    const dataEmissaoInput = document.getElementById('dataEmissao');
    const alerta48h = document.getElementById('alerta48h');
    const selectCoordenador = document.getElementById('coordenadorSelect'); // Garanta que o ID está correto no HTML

    // Carregar Coordenadores
    async function carregarCoordenadores() {
        const url = '/atestados/api/coordenadores'; // Confirme o prefixo
        console.log(`[DEBUG Coordenadores] Tentando carregar de: ${url}`);

        try {
            const response = await fetch(url);
            console.log(`[DEBUG Coordenadores] Status da resposta: ${response.status}`);

            if (!response.ok) {
                throw new Error(`Falha ao carregar coordenadores. Status: ${response.status}`);
            }

            const coordenadores = await response.json();
            console.log(`[DEBUG Coordenadores] Dados recebidos:`, coordenadores);

            if (!Array.isArray(coordenadores)) {
                 throw new Error('Formato de resposta inesperado do servidor.');
            }

            selectCoordenador.innerHTML = '<option value="">-- Selecione seu Coordenador --</option>';

            if (coordenadores.length === 0) {
                console.warn("[DEBUG Coordenadores] Nenhum coordenador ativo encontrado.");
                selectCoordenador.innerHTML = '<option value="">Nenhum coordenador encontrado</option>';
                selectCoordenador.disabled = true;
                return;
            }

            coordenadores.forEach(coord => {
                if (coord && coord.id && coord.nome) {
                    const option = document.createElement('option');
                    option.value = coord.id;
                    const escalaText = coord.escala ? ` / ${coord.escala}` : '';
                    option.textContent = `${coord.nome} (${coord.setor || 'Setor N/I'}${escalaText})`;
                    selectCoordenador.appendChild(option);
                } else {
                     console.warn("[DEBUG Coordenadores] Item inválido recebido:", coord);
                }
            });
            selectCoordenador.disabled = false;

        } catch (error) {
            console.error('[DEBUG Coordenadores] Erro ao carregar:', error);
            selectCoordenador.innerHTML = '<option value="">Erro ao carregar lista</option>';
            selectCoordenador.disabled = true;
        }
    }

    carregarCoordenadores();

    // Configurar datas
    const hoje = new Date().toISOString().split('T')[0];
    if (dataEmissaoInput) {
        dataEmissaoInput.max = hoje;
        dataEmissaoInput.addEventListener('change', validarDataEmissao);
    }

    // Validação de 48 horas
    function validarDataEmissao() {
        if (dataEmissaoInput && dataEmissaoInput.value) {
            try {
                const dataEmissaoObj = new Date(dataEmissaoInput.value + 'T23:59:59.999');
                const agora = new Date();
                const diferencaMs = agora - dataEmissaoObj;
                const limite48hMs = 48 * 60 * 60 * 1000;
                const valido = diferencaMs <= limite48hMs;

                if (alerta48h) {
                    alerta48h.style.display = 'block';
                    if (valido) {
                        alerta48h.innerHTML = '✅ <strong>Atestado Válido:</strong> Dentro do prazo de 48 horas.';
                        alerta48h.className = 'alerta valido';
                    } else {
                        alerta48h.innerHTML = '❌ <strong>Atestado Inválido:</strong> Mais de 48 horas de emissão.';
                        alerta48h.className = 'alerta invalido';
                    }
                }
                return valido;
            } catch(e) {
                if (alerta48h) alerta48h.style.display = 'none';
                return false;
            }
        }
        if (alerta48h) alerta48h.style.display = 'none';
        return true;
    }

    // Validação data início/fim
    const dataInicio = document.getElementById('dataInicio');
    const dataFim = document.getElementById('dataFim');
    if(dataFim && dataInicio) {
        dataFim.addEventListener('change', function() {
            if (dataInicio.value && dataFim.value) {
                const inicio = new Date(dataInicio.value);
                const fim = new Date(dataFim.value);
                if (fim < inicio) {
                    mostrarMensagem('A data fim não pode ser anterior à data início', 'erro');
                    dataFim.value = '';
                }
            }
        });
    }

    // Submissão do formulário
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (!validarDataEmissao()) {
                mostrarMensagem('Atestado com mais de 48 horas de emissão não é válido.', 'erro');
                return;
            }
            if (!selectCoordenador || selectCoordenador.value === "") {
                mostrarMensagem('Por favor, selecione seu coordenador.', 'erro');
                return;
            }

            const arquivoInput = document.getElementById('atestadoFile');
            const arquivo = arquivoInput ? arquivoInput.files[0] : null;
            if (arquivo && arquivo.size > 5 * 1024 * 1024) { // 5MB
                mostrarMensagem('O arquivo deve ter no máximo 5MB', 'erro');
                return;
            }
            if (!arquivo) {
                 mostrarMensagem('O anexo do atestado é obrigatório.', 'erro');
                 return;
            }

            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.textContent = 'Enviando...';
            }

            try {
                const formData = new FormData(form);
                
                const urlUpload = '/atestados/api/upload-atestado'; 
                console.log(`[DEBUG Upload] Enviando para: ${urlUpload}`); // Log da URL

                const response = await fetch(urlUpload, {
                    method: 'POST',
                    body: formData
                });

                console.log(`[DEBUG Upload] Status da resposta: ${response.status}`); // Log do Status

                // Tenta ler como JSON, mesmo se não for OK, para ver a mensagem de erro do backend
                const result = await response.json(); 
                console.log(`[DEBUG Upload] Resposta JSON recebida:`, result); // Log da resposta

                if (response.ok && result.success) {
                    mostrarMensagem(result.message || 'Enviado com sucesso!', 'sucesso');
                    form.reset();
                    if(alerta48h) alerta48h.style.display = 'block'; // Ou none, dependendo da sua preferência
                    carregarCoordenadores(); // Recarrega a lista
                } else {
                    // Usa a mensagem de erro do backend (result.error) ou uma padrão
                    throw new Error(result.error || `Erro ao enviar: ${response.statusText}`);
                }
            } catch (error) {
                console.error('[DEBUG Upload] Erro no fetch ou processamento:', error);
                // Verifica se o erro foi de parse JSON (por causa de HTML 404, etc)
                if (error instanceof SyntaxError) {
                     mostrarMensagem('Erro de comunicação com o servidor (Resposta inesperada). Verifique a URL da API.', 'erro');
                } else {
                     mostrarMensagem(error.message || 'Erro ao enviar atestado. Tente novamente.', 'erro');
                }
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = 'Enviar para Validação';
                }
            }
        });
    }

    function mostrarMensagem(texto, tipo) {
        if (mensagem) {
            mensagem.textContent = texto;
            mensagem.className = `mensagem ${tipo}`;
            mensagem.style.display = 'block';
            setTimeout(() => {
                mensagem.style.display = 'none';
            }, 5000); // Mensagem some após 5 segundos
        } else {
             console.warn("Elemento de mensagem não encontrado para exibir:", texto);
        }
    }
});