# Entrenamiento de la IA de trazas y zonas

Scripts para reproducir los modelos `app/public/modelos/trazas.onnx` y `zona.onnx`. Se entrenan en CPU sin costo. Los datos no se guardan en este repositorio.

## Modelos
- **TrazasNet** (`modelo.py`): U-Net ligera con codificador MobileNetV3-Large (ImageNet, torchvision BSD), unos 1 M de parámetros y 3.9 MB en ONNX. Para cada píxel da la probabilidad de que sea traza.
- **Zonas**: la misma arquitectura con 5 clases (otro, frente, roca de contorno, shotcrete/revestimiento, piso). En la app, la roca de contorno se separa en H.I., Corona y H.D. según su posición respecto al frente.

## Datos públicos usados
| Datos | Qué tiene | Licencia | Uso |
|---|---|---|---|
| GeoCrack, Harvard Dataverse [doi:10.7910/DVN/E4OXHQ](https://doi.org/10.7910/DVN/E4OXHQ) | 12 158 recortes de afloramientos con trazas marcadas | CC0 (datos) | entrenamiento |
| Zenodo [18078781](https://zenodo.org/records/18078781), NTNU/NGI | fracturas sintéticas (FracMan DFN) sobre texturas de roca | CC-BY 4.0 | entrenamiento (700 imágenes) |
| Zenodo [10261105](https://zenodo.org/records/10261105), Chen Baolin | 101 frentes de túnel con zonas | CC-BY 4.0 | modelo de zonas |
| GitHub nicekwow/Edge-Weighting-Driven-Rock-Slope-Fracture-Detection… | 329 fotos de taludes rocosos con fracturas | sin licencia declarada (uso de investigación) | entrenamiento con el split train; val para medir |
| GitHub Montherapy/Rock-fracture-segmentation-with-Tensorflow | 23 fotos de roca con fracturas (prueba del artículo) | sin licencia declarada | solo para medir |

Los datos de frentes de túnel con trazas marcadas que se describen en artículos (China, entre 2 mil y 15 mil fotos) no son públicos.

## Pasos
```
python3 entrenar.py 4 [pesos_iniciales.pt] [prefijo]   # trazas
python3 entrenar_zona.py 40                            # zonas
python3 exportar.py v3_mejor.pt trazas.onnx && python3 exportar_zona.py
python3 inferir_justa.py trazas.onnx eval/x 640        # fotos de Justa en /mnt/project-files/dataset
cd ../app && npx vite-node ../ia-entrenamiento/eval-familias.ts eval/x 0.5 && python3 ../ia-entrenamiento/puntuar.py eval/x/res_0.5.json
```

## Reentrenar con fotos de Justa
En la app, el botón **📦 Enviar fotos con trazas para entrenar la IA** genera un zip con la foto, la máscara de trazas y un JSON por cada foto. Hay que poner las imágenes en `extra/img` y las máscaras en `extra/mask` (recortes de 224 px) y ajustar el modelo desde los pesos actuales.
