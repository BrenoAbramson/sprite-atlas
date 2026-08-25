# Sprite Atlas

Catálogo web para explorar arquivos `Tibia.dat` e `Tibia.spr` sem modificar o Object Builder.

## Recursos

- Bibliotecas múltiplas salvas localmente no navegador.
- Compatibilidade inicial com DAT/SPR 7.60 e 7.80/7.81.
- Abas para items, outfits, effects, missiles e sprites brutas.
- Busca por ID, paginação, zoom e cópia rápida do ID.
- Montagem dos objetos que utilizam mais de uma sprite.
- Nenhum arquivo é enviado ao servidor: todo processamento acontece no navegador.

## Desenvolvimento

```bash
npm install
npm run dev
```

## GitHub Pages

O projeto já inclui publicação automática. Depois de criar o repositório:

1. Envie os arquivos para a branch `main`.
2. Abra **Settings > Pages** no GitHub.
3. Em **Source**, escolha **GitHub Actions**.
4. O workflow publicará o catálogo automaticamente.

Também é possível gerar a versão estática manualmente:

```bash
npm run build:pages
```

Os arquivos finais serão colocados em `pages-dist/`.
