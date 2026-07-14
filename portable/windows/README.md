# VBeyond — Portable Windows package (source templates)

Scripts and config templates that are copied into the release zip by `scripts/pack-windows.sh`.

See:

- [`docs/portable-windows-contract.md`](../../docs/portable-windows-contract.md) — full contracts
- [`docs/portable-windows-install.md`](../../docs/portable-windows-install.md) — install guide (Thai)

## Quick layout after pack

```
C:\VBeyond\
  start.bat / stop.bat / setup.bat
  install-service.ps1
  config\.env
  app\          # VERSION, public\, dist\ or vbeyond-api.exe
  updater\      # update.ps1
  data\
```
