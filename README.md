# Enaex Plano de Voo

Aplicação web para importar DXF, gerar poligonal para Google Earth com buffer de 7 m e exportar KMZ.

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
