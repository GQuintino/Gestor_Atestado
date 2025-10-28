document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formLogin');
    const mensagem = document.getElementById('mensagem');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        const btnSubmit = form.querySelector('.btn-submit');
        
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Aguarde...';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });

            const result = await response.json();

            if (result.success) {
                // Redireciona para a página de validação
                window.location.href = '/validar-atestado';
            } else {
                mostrarMensagem(result.error || 'Erro ao fazer login', 'erro');
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Entrar';
            }
        } catch (error) {
            mostrarMensagem('Erro de rede. Tente novamente.', 'erro');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Entrar';
        }
    });

    function mostrarMensagem(texto, tipo) {
        mensagem.textContent = texto;
        mensagem.className = `mensagem ${tipo}`;
        mensagem.style.display = 'block';
    }
});