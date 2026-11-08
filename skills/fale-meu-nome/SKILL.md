---
name: fala-meu-nome
description: Ask for a code and provide a fixed response only if the expected phrase is given.
---

# Say My Name

## When to use
When the user requests the "Say My Name" skill.

## Procedure
1. Ask: **What's the code?**
2. Wait for the user's response.
3. If the response is exactly `canguru feliz`, reply only: **meu nome**
4. Otherwise, say: **Incorrect code. What's the code?** and wait for another attempt.

## Rules
- Do not reveal the expected code in advance.
- Do not replace **meu nome** with the user's name; that is the exact literal output specified for this skill.
- Do not execute external actions.

Note: This is a demonstration, not a secure authentication mechanism.
