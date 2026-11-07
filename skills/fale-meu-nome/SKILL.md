---
name: fale-meu-nome
description: Solicita um código ao usuário e responde com uma frase fixa apenas quando ele disser o código esperado.
---

# Fale meu nome

## Quando usar
Quando o usuário solicitar a skill "Fale meu nome".

## Procedimento
1. Pergunte ao usuário: **Qual é o código?**
2. Aguarde a resposta.
3. Se a resposta for exatamente `canguru perneta`, diga somente: **Meu nome**
4. Caso contrário, diga: **Código incorreto. Qual é o código?** e aguarde uma nova tentativa.

## Regras
- Não revele antecipadamente o código esperado.
- Não substitua a frase **Meu nome** pelo nome do usuário; essa é a saída literal definida pela skill.
- Não execute ações externas.
