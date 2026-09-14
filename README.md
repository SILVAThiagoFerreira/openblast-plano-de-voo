# OpenBlast Conversor Boreholes/DXF

Aplicação web para importar DXF, gerar limite operacional com buffer configurável e exportar DXF/KMZ para uso no Google Earth.

## Identidade da ferramenta

A interface segue o padrão visual OpenBlast do Hub: topo técnico azul-marinho, acento vermelho pontual, tipografia IBM Plex e componentes quadrados/retangulares. O nome exibido é **Conversor Boreholes/DXF**; “Limite DXF + KMZ” identifica o resultado da conversão.

## Como rodar

```bash
npm install
npm run dev
```

## Como publicar

O caminho oficial é o GitHub Actions:

1. Faça commit e push na branch `main`.
2. O workflow `.github/workflows/pages.yml` instala as dependências, executa os testes, gera `dist` e publica no GitHub Pages.
3. Confirme o resultado em `https://silvathiagoferreira.github.io/openblast-plano-de-voo/`.

O script `npm run deploy` continua disponível como alternativa manual para ambientes configurados com a branch `gh-pages`; não o use junto com o workflow oficial para evitar duas versões publicadas.

## Observações

- O DXF normalmente não traz CRS explícito.
- Se o polígono aparecer deslocado no Google Earth, ajuste a zona UTM antes de exportar.
- O buffer padrão é de 7 m, conforme solicitado.
