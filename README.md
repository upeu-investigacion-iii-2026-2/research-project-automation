# Automatización de proyectos de investigación

Este repositorio sincroniza los hitos y los issues de entrega de los grupos de
investigación de `upeu-investigacion-iii-2026-2`.

## Alcance

Por defecto se procesan los repositorios activos cuyo nombre coincide con
`^ppi-.*-grupo-[0-9]+$`. Se excluyen repositorios archivados, plantillas y este
repositorio administrativo.

La configuración de etapas y fechas está en
[`config/research-stages.json`](config/research-stages.json). La sincronización
es idempotente:

- crea los hitos faltantes;
- actualiza las descripciones y fechas de los hitos existentes;
- crea un issue principal por etapa;
- mantiene cada issue asociado con su hito;
- no duplica recursos administrados por ejecuciones anteriores.

## Configuración inicial

1. Crea un token de acceso de granularidad fina con acceso a todos los
   repositorios de la organización.
2. Concede permisos de lectura de metadatos y lectura/escritura de Issues.
3. Registra el token como secreto de Actions de este repositorio con el nombre
   `ORG_AUTOMATION_TOKEN`.
4. Ejecuta **Sincronizar seguimiento de investigación** desde la pestaña
   Actions, primero con `dry_run` habilitado.
5. Revisa el registro y vuelve a ejecutarlo con `dry_run` deshabilitado.

La ejecución programada ocurre cada lunes a las 07:00, hora de Perú, y aplica
los cambios pendientes. También puede invocarse desde otro workflow mediante
`workflow_call`.

## Ejecución reutilizable

```yaml
jobs:
  sync:
    uses: upeu-investigacion-iii-2026-2/research-project-automation/.github/workflows/sync-research-tracking.yml@main
    with:
      dry_run: false
    secrets:
      ORG_AUTOMATION_TOKEN: ${{ secrets.ORG_AUTOMATION_TOKEN }}
```

## Validación local

```bash
node --test
```
