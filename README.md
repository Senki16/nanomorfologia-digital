# Nanomorfología digital: el proyecto paso a paso

Página web que explica, con modelos 3D y lenguaje sencillo, el proyecto de prácticas
**"Digital nanomorphology: Machine-learning-assisted prediction of the nanoparticle's
morphology under a reactive chemical environment"** (Prof. Aloysius Soon, Yonsei University, enero–agosto 2027).

Caso de estudio: nanopartículas de paladio (Pd) en hidrógeno.

## Secciones

0. **Portada**: una partícula de Pd que cambia de forma al añadir hidrógeno.
1. La partícula y sus caras: (111), (100), (110).
2. Cada cara tiene su propio patrón de átomos (láminas o *slabs*).
3. El hidrógeno se pega a la superficie (coberturas ¼, ½, completa).
4. Enero: aprender DFT y las herramientas.
5. **WP1**: diagrama de fase superficial (qué estructura gana según T y p).
6. **WP2**: machine learning (MLIP + active learning).
7. **WP3**: construcción de Wulff interactiva.
8. **WP3**: mapa de forma.
9. **WP4**: validación.
10. Caso de estudio: almacenamiento de hidrógeno.
11. Cronograma enero–agosto.

> Los números de los modelos son **ilustrativos**: sirven para entender la idea, no son resultados.

## Cómo correrlo

```bash
npm install
npm run dev      # servidor local
npm run build    # genera dist/
```

## Cómo está hecho

- [Vite](https://vitejs.dev/) + JavaScript sin framework.
- [Three.js](https://threejs.org/) para los modelos 3D (átomos como `InstancedMesh`).
- `src/science.js`: geometría de la red fcc, construcción de Wulff atómica y continua,
  láminas de Pd y modelos ilustrativos de energía superficial.
- `src/main.js`: visores 3D (se crean solo cuando aparecen en pantalla), gráficos SVG e interacción.
- Despliegue en Vercel (detecta Vite automáticamente).
