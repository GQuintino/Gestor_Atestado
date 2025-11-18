document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formRegister');
    const mensagem = document.getElementById('mensagem');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // ID REMOVIDO daqui
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const btnSubmit = form.querySelector('.btn-submit');
        
        // Validação atualizada (sem ID)
        if (!email || !senha) {
            mostrarMensagem('E-mail e senha são obrigatórios.', 'erro');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Aguarde...';

        try {
            // Envia apenas email e senha
            const response = await fetch('/atestados/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha }) // ID REMOVIDO daqui
            });

            const result = await response.json();

            if (result.success) {
                // Sucesso! Redireciona para a página de validação
                window.location.href = '/validar-atestado';
            } else {
                mostrarMensagem(result.error || 'Erro ao criar registo', 'erro');
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Criar Senha e Entrar';
            }
        } catch (error) {
            mostrarMensagem('Erro de rede. Tente novamente.', 'erro');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Criar Senha e Entrar';
        }
    });

    function mostrarMensagem(texto, tipo) {
        mensagem.textContent = texto;
        mensagem.className = `mensagem ${tipo}`;
        mensagem.style.display = 'block';
    }
});