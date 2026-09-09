This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Importación de horarios

El importador admite Excel, PDF e imágenes con tablas como esta:

| Septiembre 2026 | | |
| --- | --- | --- |
| Fecha | 7 | 8 |
| Colaborador | Lunes | Martes |
| María del Carmen Pérez | 8 a 12 / 16 a 20 | Franco |
| Fecha | 14 | 15 |
| Colaborador | Lunes | Martes |
| María del Carmen Pérez | 09:30-18:00 | Libre |

Los bloques pueden repetirse verticalmente o estar lado a lado. Los nombres completos se agrupan ignorando mayúsculas, tildes y espacios repetidos. Las celdas vacías conservan su posición. También se admite la plantilla con `Nombre` y fechas ISO (`YYYY-MM-DD`), y se leen todas las hojas de Excel y páginas de PDF.

El mes puede aparecer en el documento, en el título de la hoja o en las fechas. Si el recorte no incluye el mes o el año se usan los del calendario abierto, con avisos en la vista previa. El mes explícito del documento siempre tiene prioridad. Las discrepancias con los días de la semana y los horarios ilegibles aparecen en la vista previa. Los horarios contradictorios para la misma persona y fecha impiden la importación. Revisá los turnos detectados y la asignación de personas antes de confirmar.

La lectura de imágenes depende de su resolución y alineación. En capturas con bordes de tabla, se detectan las celdas y se amplía cada texto individualmente para evitar que las líneas interfieran con el OCR. Para imágenes sin cuadrícula se conserva la lectura general. El OCR descarga los modelos de español e inglés y el lector PDF carga su worker; se necesita conexión en la primera carga.

Pruebas del importador: `npm run test:import`. Comprobación de tipos: `npx tsc --noEmit`.

La regresión del OCR real usa el recorte de tres filas de Nahiara Arce, sin guardar la imagen en el repositorio. En PowerShell: asigná su ruta a `$env:SCHEDULE_OCR_IMAGE` y ejecutá `npm run test:ocr`. Comprueba automáticamente el nombre y los siete casilleros con los mismos límites de celdas, preparación de píxeles y configuración de OCR que usa la aplicación.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
