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

1. Rode `npm run deploy`.
2. Configure o GitHub Pages para servir a branch `gh-pages` na raiz.

O deploy é feito localmente pelo script `gh-pages`, sem necessidade de workflow.

## Observações

- O DXF normalmente não traz CRS explícito.
- Se o polígono aparecer deslocado no Google Earth, ajuste a zona UTM antes de exportar.
- O buffer padrão é de 7 m, conforme solicitado.
